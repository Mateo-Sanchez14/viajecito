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
import { LUCIA_REF, ME_REF, makeOverview } from "../test/fixtures";
import { GearPlanner } from "./GearPlanner";

const t = messages.ski.gear;

function setup() {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules: ["ski"] })}>
        <GearPlanner tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

const gear = (overrides: Partial<ReturnType<typeof makeOverview>["gear"]>) =>
  makeOverview({ gear: { rows: [], rent_counts: {}, sizes: [], sizes_hidden: 0, ...overrides } });

describe("GearPlanner", () => {
  afterEach(() => resetCsrfToken());

  it("summarizes what the crew will rent, in item order", async () => {
    server.use(skiOverviewHandler(gear({ rent_counts: { helmet: 1, skis: 2 } })));
    setup();

    const summary = t.rollupItem.replace("{item}", t.item.skis).replace("{count}", "2") +
      ", " + t.rollupItem.replace("{item}", t.item.helmet).replace("{count}", "1");
    expect(await screen.findByText(t.rollup.replace("{summary}", summary))).toBeInTheDocument();
  });

  it("says nobody rents when there is nothing to rent", async () => {
    server.use(skiOverviewHandler(gear({})));
    setup();

    expect(await screen.findByText(t.nothingToRent)).toBeInTheDocument();
  });

  it("shows only the sizes people agreed to share, and counts the hidden ones", async () => {
    server.use(
      skiOverviewHandler(
        gear({
          sizes: [{ person: LUCIA_REF, boot_size_eu: 42.5, height_cm: 178, weight_kg: null }],
          sizes_hidden: 2,
        }),
      ),
    );
    setup();

    const sizes = await screen.findByRole("list", { name: t.sizes });
    const item = within(sizes).getByRole("listitem");
    expect(item).toHaveTextContent("Lucia Gomez");
    expect(item).toHaveTextContent("42,5");
    expect(item).toHaveTextContent("178");
    expect(screen.getByText(t.sizesHidden.replace("{n}", "2"))).toBeInTheDocument();
  });

  it("hides the hidden-sizes note when everyone shared", async () => {
    server.use(skiOverviewHandler(gear({ sizes_hidden: 0 })));
    setup();

    await screen.findByText(t.nothingToRent);
    expect(screen.queryByText(/no compartieron talles/)).not.toBeInTheDocument();
  });

  it("starts from my saved items and sends only the ones with a mode", async () => {
    let body: unknown;
    server.use(
      csrfHandler,
      skiOverviewHandler(
        gear({
          rows: [
            { person: ME_REF, item: "skis", mode: "rent", price: null, currency: "USD", note: "Lo de Pepe" },
            { person: LUCIA_REF, item: "board", mode: "own", price: null, currency: "USD", note: "" },
          ],
        }),
      ),
      http.put("/api/trips/{trip_id}/ski/gear/me", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([]);
      }),
    );
    setup();

    const skis = await screen.findByLabelText(t.item.skis);
    expect(skis).toHaveValue("rent");
    expect(screen.getByLabelText(t.item.board)).toHaveValue("none");

    fireEvent.change(screen.getByLabelText(t.item.helmet), { target: { value: "borrow" } });
    fireEvent.click(screen.getByRole("button", { name: t.save }));

    await waitFor(() =>
      expect(body).toEqual({
        items: [
          { item: "skis", mode: "rent", note: "Lo de Pepe" },
          { item: "helmet", mode: "borrow", note: "" },
        ],
      }),
    );
    expect(await screen.findByText(t.saved)).toBeInTheDocument();
  });

  it("shows an error when saving fails", async () => {
    server.use(
      csrfHandler,
      skiOverviewHandler(gear({})),
      http.put("/api/trips/{trip_id}/ski/gear/me", ({ response }) =>
        response(400).json({ code: "invalid_request", message: "x" }),
      ),
    );
    setup();
    await screen.findByLabelText(t.item.skis);

    fireEvent.click(screen.getByRole("button", { name: t.save }));

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.ski.errors.generic);
  });
});
