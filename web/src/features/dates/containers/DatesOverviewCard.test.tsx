import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { CREW_ID, TRIP_ID, makeMe, makeTrip } from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { getAvailability, listDecisions, makeAvailability, makeDecision } from "../test/handlers";
import { DatesOverviewCard } from "./DatesOverviewCard";

const m = messages.dates;

function setup(trip = makeTrip()) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <DatesOverviewCard tripId={TRIP_ID} crewId={CREW_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("DatesOverviewCard", () => {
  it("links to the dates section", async () => {
    server.use(listDecisions([]));
    setup();

    const link = await screen.findByRole("link", { name: new RegExp(messages.trips.modules.dates) });
    expect(link).toHaveAttribute("href", `/crews/${CREW_ID}/trips/${TRIP_ID}/dates`);
  });

  it("shows how many voted and the best window of an open decision", async () => {
    server.use(listDecisions([makeDecision()]), getAvailability(makeAvailability()));
    setup();

    const expected = `${m.overview.voted.replace("{n}", "2").replace("{total}", "3")} · ${m.overview.best.replace("{range}", "12–18 jul")}`;
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("shows only the vote count while nobody has answered", async () => {
    server.use(
      listDecisions([makeDecision({ respondents: 0 })]),
      getAvailability(makeAvailability({ has_data: false })),
    );
    setup();

    expect(await screen.findByText(m.overview.voted.replace("{n}", "0").replace("{total}", "3"))).toBeInTheDocument();
  });

  it("shows the fixed trip dates when no decision is open", async () => {
    server.use(listDecisions([makeDecision({ status: "closed" })]));
    setup();

    expect(await screen.findByText(new RegExp(`^${m.overview.fixed} · .*2027`))).toBeInTheDocument();
    expect(screen.getByText(/jul 2027/)).toBeInTheDocument();
  });

  it("invites to open the vote when there is no decision and no dates", async () => {
    server.use(listDecisions([]));
    setup(makeTrip({ start_on: null, end_on: null }));

    expect(await screen.findByText(m.overview.empty)).toBeInTheDocument();
  });
});
