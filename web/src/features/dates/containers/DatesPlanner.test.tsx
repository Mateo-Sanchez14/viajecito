import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider, useTripContext } from "@/features/trips/TripProvider";
import { TRIP_ID, makeMe, makeTrip } from "@/features/trips/fixtures";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import {
  DECISION_ID,
  csrfHandler,
  errorBody,
  getAvailability,
  http,
  listDecisions,
  makeAvailability,
  makeDecision,
  makePersonRef,
} from "../test/handlers";
import { DatesPlanner } from "./DatesPlanner";

const m = messages.dates;
type Decision = components["schemas"]["DecisionOut"];

function TripDates() {
  const { trip } = useTripContext();
  return <p data-testid="trip-dates">{`${trip.start_on ?? "none"}|${trip.end_on ?? "none"}`}</p>;
}

function setup(trip = makeTrip()) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <TripDates />
        <DatesPlanner tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

const closedDecision = (overrides: Partial<Decision> = {}) =>
  makeDecision({
    status: "closed",
    outcome_start: "2027-07-12",
    outcome_end: "2027-07-18",
    closed_by: makePersonRef(),
    ...overrides,
  });

afterEach(() => resetCsrfToken());

describe("DatesPlanner without a decision", () => {
  it("offers the form right away when the trip has no dates", async () => {
    server.use(listDecisions([]));
    setup(makeTrip({ start_on: null, end_on: null }));

    expect(await screen.findByText(m.empty.title)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: m.open.title })).toBeInTheDocument();
  });

  it("shows the trip dates first and reveals the form on demand when it already has dates", async () => {
    server.use(listDecisions([]));
    setup();

    expect(await screen.findByText(new RegExp(m.empty.tripDates.split(":")[0]))).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: m.open.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: m.empty.voteOther }));

    expect(screen.getByRole("heading", { name: m.open.title })).toBeInTheDocument();
  });

  it("explains a failed load and retries", async () => {
    let calls = 0;
    server.use(
      http.get("/api/trips/{trip_id}/decisions", ({ response }) => {
        calls += 1;
        return calls === 1 ? response(404).json(errorBody("not_found")) : response(200).json([]);
      }),
    );
    setup(makeTrip({ start_on: null, end_on: null }));

    expect(await screen.findByRole("alert")).toHaveTextContent(m.errors.not_found);
    fireEvent.click(screen.getByRole("button", { name: m.retry }));

    expect(await screen.findByText(m.empty.title)).toBeInTheDocument();
  });
});

describe("DatesPlanner with an open decision", () => {
  it("shows the grid, the best windows and who is missing", async () => {
    server.use(listDecisions([makeDecision()]), getAvailability(makeAvailability()));
    setup();

    expect(await screen.findByRole("grid", { name: m.grid.label })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: m.best.title })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: m.missing.title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(m.overview.voted.replace("{n}", "2").replace("{total}", "3")))).toBeInTheDocument();
  });

  it("confirms before closing, warns about replacing dates, writes them and refreshes the trip", async () => {
    let decisions: Decision[] = [makeDecision()];
    let closeBody: unknown;
    let tripFetches = 0;
    server.use(
      csrfHandler,
      http.get("/api/trips/{trip_id}/decisions", ({ response }) => response(200).json(decisions)),
      getAvailability(makeAvailability()),
      http.post("/api/decisions/{decision_id}/close", async ({ request, response }) => {
        closeBody = await request.json();
        decisions = [closedDecision()];
        return response(200).json(decisions[0]);
      }),
      http.get("/api/trips/{trip_id}", ({ response }) => {
        tripFetches += 1;
        return response(200).json(makeTrip({ start_on: "2027-07-12", end_on: "2027-07-18" }));
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(m.best.close) }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(m.confirm.close.replace("{start}", "12 jul").replace("{end}", "18 jul"))).toBeInTheDocument();
    expect(within(dialog).getByText(m.confirm.overwrite)).toBeInTheDocument();
    expect(closeBody).toBeUndefined();

    fireEvent.click(within(dialog).getByRole("button", { name: m.confirm.closeAction }));

    expect(await screen.findByRole("heading", { name: m.closed.title })).toBeInTheDocument();
    expect(closeBody).toEqual({ start_on: "2027-07-12", end_on: "2027-07-18" });
    await waitFor(() => expect(screen.getByTestId("trip-dates")).toHaveTextContent("2027-07-12|2027-07-18"));
    expect(tripFetches).toBeGreaterThan(0);
  });

  it("sends the close once even if the confirm button is pressed twice", async () => {
    let closes = 0;
    server.use(
      csrfHandler,
      listDecisions([makeDecision()]),
      getAvailability(makeAvailability()),
      http.post("/api/decisions/{decision_id}/close", async ({ response }) => {
        closes += 1;
        return response(200).json(closedDecision());
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(m.best.close) }));
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: m.confirm.closeAction });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(closes).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closes).toBe(1);
  });

  it("does not warn about replacing dates when the trip has none, and cancelling sends nothing", async () => {
    let closed = false;
    server.use(
      csrfHandler,
      listDecisions([makeDecision()]),
      getAvailability(makeAvailability()),
      http.post("/api/decisions/{decision_id}/close", ({ response }) => {
        closed = true;
        return response(200).json(closedDecision());
      }),
    );
    setup(makeTrip({ start_on: null, end_on: null }));

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(m.best.close) }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(m.confirm.overwrite)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: m.confirm.cancel }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(closed).toBe(false);
  });

  it("maps a close failure to its copy", async () => {
    server.use(
      csrfHandler,
      listDecisions([makeDecision()]),
      getAvailability(makeAvailability()),
      http.post("/api/decisions/{decision_id}/close", ({ response }) =>
        response(400).json(errorBody("no_window")),
      ),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(m.best.close) }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: m.confirm.closeAction }));

    expect(await screen.findByText(m.errors.no_window)).toBeInTheDocument();
  });

  it("lets me edit the open decision", async () => {
    server.use(listDecisions([makeDecision()]), getAvailability(makeAvailability()));
    setup();

    fireEvent.click(await screen.findByRole("button", { name: m.open.edit }));

    expect(screen.getByRole("button", { name: m.open.save })).toBeInTheDocument();
    expect(screen.getByLabelText(m.open.from)).toHaveValue("2027-07-05");
  });
});

describe("DatesPlanner with a closed decision", () => {
  it("shows the outcome and reopens after confirming", async () => {
    let decisions: Decision[] = [closedDecision()];
    let reopened = false;
    server.use(
      csrfHandler,
      http.get("/api/trips/{trip_id}/decisions", ({ response }) => response(200).json(decisions)),
      getAvailability(makeAvailability()),
      http.post("/api/decisions/{decision_id}/reopen", ({ response }) => {
        reopened = true;
        decisions = [makeDecision()];
        return response(200).json(decisions[0]);
      }),
    );
    setup();

    expect(await screen.findByRole("heading", { name: m.closed.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.closed.reopen }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(m.confirm.reopenDescription)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: m.confirm.reopenAction }));

    expect(await screen.findByRole("grid", { name: m.grid.label })).toBeInTheDocument();
    expect(reopened).toBe(true);
  });

  it("maps a reopen conflict to its copy", async () => {
    server.use(
      csrfHandler,
      listDecisions([closedDecision()]),
      http.post("/api/decisions/{decision_id}/reopen", ({ response }) =>
        response(409).json(errorBody("decision_already_open")),
      ),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: m.closed.reopen }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: m.confirm.reopenAction }));

    expect(await screen.findByText(m.errors.decision_already_open)).toBeInTheDocument();
  });

  it("offers voting other dates", async () => {
    server.use(listDecisions([closedDecision({ id: DECISION_ID })]));
    setup();

    fireEvent.click(await screen.findByRole("button", { name: m.empty.voteOther }));

    expect(screen.getByRole("heading", { name: m.open.title })).toBeInTheDocument();
  });
});
