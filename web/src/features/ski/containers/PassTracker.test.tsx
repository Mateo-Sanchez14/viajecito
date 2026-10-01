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
import { LUCIA_REF, ME_REF, RESORT_ID, makeOverview, makePassRow, makeTripResort } from "../test/fixtures";
import { PassTracker } from "./PassTracker";

const t = messages.ski.passes;

function setup() {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules: ["ski"] })}>
        <PassTracker tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("PassTracker", () => {
  afterEach(() => resetCsrfToken());

  it("lists who is still missing a pass, with the count", async () => {
    server.use(
      skiOverviewHandler(
        makeOverview({
          passes: {
            rows: [makePassRow()],
            missing: [
              { person: ME_REF, resort_id: RESORT_ID },
              { person: LUCIA_REF, resort_id: null },
            ],
          },
        }),
      ),
    );
    setup();

    const missing = await screen.findByRole("list", { name: t.missingTitle });
    const items = within(missing).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(t.missingFor.replace("{name}", "Mateo").replace("{resort}", "Cerro Catedral"));
    expect(items[1]).toHaveTextContent(
      t.missingFor.replace("{name}", "Lucia Gomez").replace("{resort}", t.anyResort),
    );
    expect(screen.getByText(t.missing.replace("{n}", "2"))).toBeInTheDocument();
  });

  it("says everyone is covered when nobody is missing", async () => {
    server.use(skiOverviewHandler(makeOverview({ passes: { rows: [makePassRow()], missing: [] } })));
    setup();

    expect(await screen.findByText(t.allCovered)).toBeInTheDocument();
  });

  it("shows the crew's passes with their status", async () => {
    server.use(skiOverviewHandler());
    setup();

    const list = await screen.findByRole("list", { name: t.crew });
    expect(within(list).getByText("Lucia Gomez")).toBeInTheDocument();
    expect(within(list).getByText(t.status.bought)).toBeInTheDocument();
    expect(within(list).getByText(/Pase 5 dias/)).toBeInTheDocument();
  });

  it("flips my status and clears my missing entry before the api answers", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let body: unknown;
    server.use(
      csrfHandler,
      skiOverviewHandler(),
      http.put("/api/trips/{trip_id}/ski/passes/me", async ({ request }) => {
        body = await request.json();
        await gate;
        return HttpResponse.json(makePassRow({ person: ME_REF, status: "bought" }));
      }),
    );
    setup();
    await screen.findByRole("list", { name: t.missingTitle });

    fireEvent.click(screen.getByRole("button", { name: t.status.bought }));

    await waitFor(() => expect(pressed(t.status.bought)).toBe("true"));
    expect(screen.queryByRole("list", { name: t.missingTitle })).not.toBeInTheDocument();
    expect(screen.getByText(t.allCovered)).toBeInTheDocument();
    release();
    await waitFor(() => expect(body).toMatchObject({ resort_id: RESORT_ID, status: "bought" }));
  });

  it("rolls back and shows an error when the api refuses", async () => {
    server.use(
      csrfHandler,
      skiOverviewHandler(),
      http.put("/api/trips/{trip_id}/ski/passes/me", ({ response }) =>
        response(400).json({ code: "invalid_request", message: "x" }),
      ),
    );
    setup();
    await screen.findByRole("list", { name: t.missingTitle });

    fireEvent.click(screen.getByRole("button", { name: t.status.bought }));

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.ski.errors.generic);
    await waitFor(() => expect(screen.getByRole("list", { name: t.missingTitle })).toBeInTheDocument());
    expect(pressed(t.status.bought)).toBe("false");
  });

  it("saves the product and days of my pass with the chosen status", async () => {
    let body: unknown;
    server.use(
      csrfHandler,
      skiOverviewHandler(
        makeOverview({
          resorts: [makeTripResort()],
          passes: { rows: [makePassRow({ person: ME_REF, status: "bought", product: "", days: null })], missing: [] },
        }),
      ),
      http.put("/api/trips/{trip_id}/ski/passes/me", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makePassRow({ person: ME_REF }));
      }),
    );
    setup();
    await screen.findByText(t.allCovered);

    fireEvent.change(screen.getByLabelText(t.product), { target: { value: "Pase 7 dias" } });
    fireEvent.change(screen.getByLabelText(t.days), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveDetails }));

    await waitFor(() =>
      expect(body).toMatchObject({ resort_id: RESORT_ID, status: "bought", product: "Pase 7 dias", days: 7 }),
    );
  });
});
