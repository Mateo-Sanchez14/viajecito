import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { makeMe, makeTrip, TRIP_ID } from "@/features/trips/fixtures";
import { resetCsrfToken } from "@/shared/api/csrf";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { csrfHandler, http, skiOverviewHandler } from "../test/handlers";
import { RESORT_2_ID, RESORT_ID, makeOverview, makeReport, makeResort, makeTripResort } from "../test/fixtures";
import { ConditionsPanel } from "./ConditionsPanel";

const t = messages.ski;

function setup() {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules: ["ski"] })}>
        <ConditionsPanel tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("ConditionsPanel", () => {
  afterEach(() => resetCsrfToken());

  it("shows a snow card per resort, flagging the stale one", async () => {
    server.use(
      skiOverviewHandler(
        makeOverview({
          resorts: [
            makeTripResort(),
            makeTripResort({
              resort: makeResort({ id: RESORT_2_ID, name: "Las Leñas" }),
              position: 1,
              latest_report: makeReport({ stale: true, age_hours: 20 }),
            }),
          ],
        }),
      ),
    );
    setup();

    expect(await screen.findByRole("heading", { name: "Cerro Catedral" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Las Leñas" })).toBeInTheDocument();
    expect(screen.getAllByText(/Dato de hace/)).toHaveLength(1);
    expect(screen.getByText(t.conditions.stale.replace("{hours}", "20"))).toBeInTheDocument();
  });

  it("prompts to pick a resort when the trip has none", async () => {
    server.use(skiOverviewHandler(makeOverview({ resorts: [] })));
    setup();

    expect(await screen.findByText(t.empty.resorts)).toBeInTheDocument();
  });

  it("validates the manual report before sending it", async () => {
    server.use(skiOverviewHandler());
    setup();
    fireEvent.click(await screen.findByRole("button", { name: t.conditions.report }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: t.report.submit }));
    expect(await within(dialog).findByText(t.report.errors.empty)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(t.report.base), { target: { value: "1001" } });
    fireEvent.change(within(dialog).getByLabelText(t.report.new24h), { target: { value: "301" } });
    fireEvent.change(within(dialog).getByLabelText(t.report.temp), { target: { value: "31" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.report.submit }));

    expect(await within(dialog).findByText(t.report.errors.base)).toBeInTheDocument();
    expect(within(dialog).getByText(t.report.errors.new24h)).toBeInTheDocument();
    expect(within(dialog).getByText(t.report.errors.temp)).toBeInTheDocument();
  });

  it("posts a manual report with only the filled fields, then closes the sheet", async () => {
    let body: unknown;
    let path = "";
    server.use(
      csrfHandler,
      skiOverviewHandler(),
      http.post("/api/trips/{trip_id}/ski/resorts/{resort_id}/reports", async ({ request, params }) => {
        body = await request.json();
        path = String(params.resort_id);
        return HttpResponse.json(makeReport({ source: "manual" }), { status: 201 });
      }),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: t.conditions.report }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText(t.report.base), { target: { value: "120" } });
    fireEvent.change(within(dialog).getByLabelText(t.report.new24h), { target: { value: "15" } });
    fireEvent.change(within(dialog).getByLabelText(t.report.status), { target: { value: "  Polvo  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.report.submit }));

    await waitFor(() => expect(body).toEqual({ base_cm: 120, new_24h_cm: 15, status_text: "Polvo" }));
    expect(path).toBe(RESORT_ID);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("explains the rate limit when reporting too often", async () => {
    server.use(
      csrfHandler,
      skiOverviewHandler(),
      http.post("/api/trips/{trip_id}/ski/resorts/{resort_id}/reports", ({ response }) =>
        response(429).json({ code: "rate_limited", message: "x" }),
      ),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: t.conditions.report }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.report.base), { target: { value: "50" } });

    fireEvent.click(within(dialog).getByRole("button", { name: t.report.submit }));

    expect(await within(dialog).findByText(t.errors.rate_limited)).toBeInTheDocument();
  });
});
