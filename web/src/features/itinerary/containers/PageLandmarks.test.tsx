import { expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { ItineraryPlanner } from "./ItineraryPlanner";
import { itineraryHandler, notesHandler } from "../test/handlers";
import { TodayView } from "@/features/today/containers/TodayView";
import { todayHandler } from "@/features/today/test/handlers";
import { TripProvider } from "@/features/trips/TripProvider";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeTrip, makeMe } from "@/features/trips/fixtures";
import { TripShell } from "@/ui/organisms/TripShell";

it.each(["itinerary", "today"])("keeps the integrated %s page landmark and title unique", (section) => {
  server.use(itineraryHandler(), todayHandler(), notesHandler());
  const { container } = renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules: ["itinerary", "today"] })}>
        <main>
          <TripShell title="Trip" subtitle="" navLabel="Sections" navItems={[]}>
            {section === "itinerary"
              ? <ItineraryPlanner tripId="trip" />
              : <TodayView tripId="trip" crewId="crew" />}
          </TripShell>
        </main>
      </TripProvider>
    </MeProvider>,
  );
  expect(container.querySelectorAll("main")).toHaveLength(1);
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelector("h2")).toBeInTheDocument();
});
