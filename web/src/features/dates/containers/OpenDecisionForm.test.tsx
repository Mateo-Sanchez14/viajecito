import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { TRIP_ID } from "@/features/trips/fixtures";
import { HttpResponse, csrfHandler, errorBody, http, makeDecision } from "../test/handlers";
import { OpenDecisionForm } from "./OpenDecisionForm";

const m = messages.dates;
const field = (label: string) => screen.getByLabelText(label);
const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const submit = (name: string = m.open.submit) => fireEvent.click(screen.getByRole("button", { name }));

function fillValid() {
  change(m.open.from, "2027-07-01");
  change(m.open.to, "2027-08-15");
  change(m.open.minDays, "7");
}

afterEach(() => resetCsrfToken());

describe("OpenDecisionForm (create)", () => {
  it("validates before calling the api and explains each mistake", () => {
    renderWithProviders(<OpenDecisionForm tripId={TRIP_ID} />);

    submit();

    expect(screen.getByText(m.open.errors.rangeRequired)).toBeInTheDocument();
    change(m.open.from, "2027-08-02");
    change(m.open.to, "2027-08-01");
    change(m.open.minDays, "0");
    submit();
    expect(screen.getByText(m.open.errors.endBeforeStart)).toBeInTheDocument();
    expect(screen.getByText(m.open.errors.minDaysInvalid)).toBeInTheDocument();
    expect(field(m.open.minDays)).toHaveAttribute("aria-invalid", "true");
  });

  it("posts the decision and reports completion", async () => {
    let body: unknown;
    server.use(
      csrfHandler,
      http.post("/api/trips/{trip_id}/decisions", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDecision(), { status: 201 });
      }),
    );
    const onDone = vi.fn();
    renderWithProviders(<OpenDecisionForm tripId={TRIP_ID} onDone={onDone} />);

    fillValid();
    change(m.open.maxDays, "10");
    submit();

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toEqual({
      kind: "dates",
      window_start: "2027-07-01",
      window_end: "2027-08-15",
      min_days: 7,
      max_days: 10,
      maybe_weight: "0.50",
    });
  });

  it("keeps the maybe weight under Avanzado and sends a changed weight and a deadline", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      csrfHandler,
      http.post("/api/trips/{trip_id}/decisions", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeDecision(), { status: 201 });
      }),
    );
    renderWithProviders(<OpenDecisionForm tripId={TRIP_ID} onDone={() => {}} />);
    expect(screen.queryByLabelText(m.open.maybeWeight)).not.toBeVisible();

    fireEvent.click(screen.getByText(m.open.advanced));
    expect(field(m.open.maybeWeight)).toHaveValue(0.5);
    fillValid();
    change(m.open.maybeWeight, "0.8");
    change(m.open.deadline, "2999-06-20T18:00");
    submit();

    await waitFor(() => expect(body.kind).toBe("dates"));
    expect(body.maybe_weight).toBe("0.80");
    expect(body.deadline).toBe(new Date("2999-06-20T18:00").toISOString());
  });

  it("maps an api conflict to its copy", async () => {
    server.use(
      csrfHandler,
      http.post("/api/trips/{trip_id}/decisions", ({ response }) =>
        response(409).json(errorBody("decision_already_open")),
      ),
    );
    renderWithProviders(<OpenDecisionForm tripId={TRIP_ID} />);

    fillValid();
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(m.errors.decision_already_open);
  });
});

describe("OpenDecisionForm (edit)", () => {
  const decision = makeDecision({ window_start: "2027-07-05", window_end: "2027-07-18", min_days: 5, max_days: 8, maybe_weight: "0.25" });

  it("is prefilled from the decision and patches it", async () => {
    let body: unknown;
    server.use(
      csrfHandler,
      http.patch("/api/decisions/{decision_id}", async ({ request, response }) => {
        body = await request.json();
        return response(200).json(decision);
      }),
    );
    const onDone = vi.fn();
    renderWithProviders(<OpenDecisionForm tripId={TRIP_ID} decision={decision} onDone={onDone} />);

    expect(field(m.open.from)).toHaveValue("2027-07-05");
    expect(field(m.open.minDays)).toHaveValue(5);
    expect(field(m.open.maxDays)).toHaveValue(8);
    change(m.open.minDays, "6");
    submit(m.open.save);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toEqual({
      window_start: "2027-07-05",
      window_end: "2027-07-18",
      min_days: 6,
      max_days: 8,
      maybe_weight: "0.25",
      deadline: null,
    });
  });

  it("offers cancel", () => {
    const onCancel = vi.fn();
    renderWithProviders(<OpenDecisionForm tripId={TRIP_ID} decision={decision} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: m.open.cancel }));

    expect(onCancel).toHaveBeenCalled();
  });
});
