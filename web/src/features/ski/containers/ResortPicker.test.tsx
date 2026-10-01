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
import { RESORT_2_ID, RESORT_ID, makeOverview, makeResort, makeTripResort } from "../test/fixtures";
import { ResortPicker } from "./ResortPicker";

const t = messages.ski.resorts;
const catalog = [
  makeResort(),
  makeResort({ id: RESORT_2_ID, slug: "las-lenas", name: "Las Le\u00f1as", region: "Mendoza" }),
  makeResort({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", slug: "portillo", name: "Portillo", country: "CL", region: "Valparaiso" }),
];
const catalogHandler = http.get("/api/ski/resorts", ({ response }) => response(200).json(catalog));

function setup() {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules: ["ski"] })}>
        <ResortPicker tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("ResortPicker", () => {
  afterEach(() => resetCsrfToken());

  it("lists the trip's resorts and offers only the ones not added yet", async () => {
    server.use(skiOverviewHandler(), catalogHandler);
    setup();

    const added = await screen.findByRole("list", { name: t.added });
    expect(within(added).getByText("Cerro Catedral")).toBeInTheDocument();
    const available = await screen.findByRole("list", { name: t.available });
    expect(within(available).queryByText("Cerro Catedral")).not.toBeInTheDocument();
    expect(within(available).getByText("Las Le\u00f1as")).toBeInTheDocument();
    expect(within(available).getByText("Portillo")).toBeInTheDocument();
  });

  it("filters the catalog while typing, ignoring accents and case", async () => {
    server.use(skiOverviewHandler(), catalogHandler);
    setup();
    await screen.findByText("Portillo");

    fireEvent.change(screen.getByLabelText(t.search), { target: { value: "LENAS" } });

    const available = screen.getByRole("list", { name: t.available });
    expect(within(available).getByText("Las Le\u00f1as")).toBeInTheDocument();
    expect(within(available).queryByText("Portillo")).not.toBeInTheDocument();
  });

  it("says when nothing matches the search", async () => {
    server.use(skiOverviewHandler(), catalogHandler);
    setup();
    await screen.findByText("Portillo");

    fireEvent.change(screen.getByLabelText(t.search), { target: { value: "zzz" } });

    expect(screen.getByText(t.noMatches)).toBeInTheDocument();
  });

  it("adds a resort to the trip", async () => {
    let body: unknown;
    server.use(
      csrfHandler,
      skiOverviewHandler(),
      catalogHandler,
      http.post("/api/trips/{trip_id}/ski/resorts", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeTripResort({ resort: catalog[1] }), { status: 201 });
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: t.addNamed.replace("{name}", "Las Le\u00f1as") }));

    await waitFor(() => expect(body).toEqual({ resort_id: RESORT_2_ID }));
  });

  it("explains when the resort was already added", async () => {
    server.use(
      csrfHandler,
      skiOverviewHandler(),
      catalogHandler,
      http.post("/api/trips/{trip_id}/ski/resorts", ({ response }) =>
        response(409).json({ code: "resort_already_added", message: "x" }),
      ),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: t.addNamed.replace("{name}", "Las Le\u00f1as") }));

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.ski.errors.resort_already_added);
  });

  it("removes a resort from the trip", async () => {
    let removed = "";
    server.use(
      csrfHandler,
      skiOverviewHandler(makeOverview()),
      catalogHandler,
      http.delete("/api/trips/{trip_id}/ski/resorts/{resort_id}", ({ params }) => {
        removed = String(params.resort_id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: t.remove.replace("{name}", "Cerro Catedral") }));

    await waitFor(() => expect(removed).toBe(RESORT_ID));
  });
});
