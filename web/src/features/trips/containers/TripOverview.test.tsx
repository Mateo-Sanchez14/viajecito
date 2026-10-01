import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { TripProvider } from "../TripProvider";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeTrip } from "../fixtures";
import { TripOverview } from "./TripOverview";

function setup(trip = makeTrip()) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <TripOverview />
      </TripProvider>
    </MeProvider>,
  );
}

describe("TripOverview", () => {
  it("shows dates and destination", () => {
    setup();

    expect(
      screen.getByText(
        messages.trips.dateRange
          .replace("{start}", formatDay("2027-07-01"))
          .replace("{end}", formatDay("2027-07-08")),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Bariloche")).toBeInTheDocument();
  });

  it("lists participants with their RSVP badge", () => {
    setup();

    const list = screen.getByRole("list", { name: messages.trips.overview.participants });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Mateo");
    expect(items[0]).toHaveTextContent(messages.trips.rsvp.in);
    expect(items[1]).toHaveTextContent("Lucia Gomez");
    expect(items[1]).toHaveTextContent(messages.trips.rsvp.maybe);
  });

  it("builds one module card per module, linking to its section", () => {
    setup(makeTrip({ modules: ["budget", "ski", "mystery"] }));

    const base = `/crews/${CREW_ID}/trips/${TRIP_ID}`;
    expect(screen.getByRole("link", { name: new RegExp(messages.trips.sections.budget) })).toHaveAttribute("href", `${base}/budget`);
    expect(screen.getByRole("link", { name: new RegExp(messages.trips.sections.ski) })).toHaveAttribute("href", `${base}/ski`);
    // A module without copy still gets a card, labelled by its key.
    expect(screen.getByRole("link", { name: /mystery/ })).toHaveAttribute("href", `${base}/mystery`);
    expect(screen.queryByRole("link", { name: new RegExp(messages.trips.sections.documents) })).not.toBeInTheDocument();
  });

  it("includes the RSVP control", () => {
    setup();

    expect(screen.getByRole("button", { name: messages.trips.rsvp.in })).toBeInTheDocument();
  });
});
