import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { makeSummary, makePreview } from "@/features/proposals/test/handlers";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { mapProposalsHandler } from "../test/handlers";
import { MapOverviewCard } from "./MapOverviewCard";
it("links to the map and counts only located proposals", async () => {
  server.use(
    mapProposalsHandler([
      makeSummary({ preview: makePreview({ lat: -41, lng: -71 }) }),
      makeSummary({ id: "missing", preview: null }),
    ]),
  );
  renderWithProviders(<MapOverviewCard tripId="trip" crewId="crew" />);
  expect(screen.getByRole("link", { name: /Ver en el mapa/ })).toHaveAttribute(
    "href",
    "/crews/crew/trips/trip/map",
  );
  expect(await screen.findByText("1 lugar en el mapa")).toBeVisible();
});
