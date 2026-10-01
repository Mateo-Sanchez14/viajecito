import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import {
  makeMe,
  makeTrip,
  TRIP_ID,
  CREW_ID,
  PERSON_ID,
} from "@/features/trips/fixtures";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/render";
import { LogisticsOverviewCard } from "./LogisticsOverviewCard";
it("links to logistics and counts overdue/mine tasks", async () => {
  server.use(
    http.get("*/api/trips/:id/tasks", () =>
      HttpResponse.json([
        {
          id: "t",
          status: "open",
          overdue: true,
          owner: { person_id: PERSON_ID },
        },
      ]),
    ),
  );
  renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <LogisticsOverviewCard tripId={TRIP_ID} crewId={CREW_ID} />
      </TripProvider>
    </MeProvider>,
  );
  await screen.findByText("1 tareas vencidas · 1 tuyas");
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    `/crews/${CREW_ID}/trips/${TRIP_ID}/logistics`,
  );
});
