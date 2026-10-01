import { screen, within } from "@testing-library/react";
import type { TripCard } from "../cards/types";
import { describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { TripProvider } from "../TripProvider";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeTrip } from "../fixtures";
import { TripOverview } from "./TripOverview";

function setup(trip = makeTrip(), cards: TripCard[] = []) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <TripOverview cards={cards} />
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

  it("renders a registered card for an enabled module, with the trip and crew ids", () => {
    const Card = ({ tripId, crewId }: { tripId: string; crewId: string }) => (
      <p>{`budget card ${tripId} ${crewId}`}</p>
    );
    setup(makeTrip({ modules: ["budget", "dates"] }), [
      { key: "budget", module: "budget", order: 40, Component: Card },
    ]);

    expect(screen.getByText(`budget card ${TRIP_ID} ${CREW_ID}`)).toBeInTheDocument();
  });

  it("does not render a card whose module the trip does not have", () => {
    setup(makeTrip({ modules: ["dates"] }), [
      { key: "ski", module: "ski", order: 10, Component: () => <p>ski card</p> },
    ]);

    expect(screen.queryByText("ski card")).not.toBeInTheDocument();
  });

  it("always renders a card that declares no module", () => {
    setup(makeTrip({ modules: [] }), [
      { key: "countdown", order: 1, Component: () => <p>countdown card</p> },
    ]);

    expect(screen.getByText("countdown card")).toBeInTheDocument();
  });

  it("shows a placeholder link for each enabled module without a registered card", () => {
    setup(makeTrip({ modules: ["budget", "ski", "mystery"] }), [
      { key: "budget", module: "budget", order: 40, Component: () => <p>budget card</p> },
    ]);

    const base = `/crews/${CREW_ID}/trips/${TRIP_ID}`;
    expect(screen.queryByRole("link", { name: messages.trips.modules.budget })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.trips.modules.ski })).toHaveAttribute("href", `${base}/ski`);
    // A module without copy still gets a placeholder, labelled by its key.
    expect(screen.getByRole("link", { name: "mystery" })).toHaveAttribute("href", `${base}/mystery`);
    expect(screen.queryByRole("link", { name: messages.trips.modules.documents })).not.toBeInTheDocument();
  });

  it("orders cards by their order, then placeholders after them", () => {
    setup(makeTrip({ modules: ["budget", "dates", "ski"] }), [
      { key: "b", module: "budget", order: 40, Component: () => <p>card-b</p> },
      { key: "a", module: "dates", order: 20, Component: () => <p>card-a</p> },
      { key: "c", order: 5, Component: () => <p>card-c</p> },
    ]);

    const grid = screen.getByRole("list", { name: messages.trips.overview.modules });
    expect(within(grid).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "card-c",
      "card-a",
      "card-b",
      messages.trips.modules.ski,
    ]);
  });

  it("hides the list item of a card that renders nothing, so no empty grid cell remains", () => {
    setup(makeTrip({ modules: [] }), [
      { key: "empty", order: 1, Component: () => null },
      { key: "full", order: 2, Component: () => <p>full card</p> },
    ]);

    const items = within(screen.getByRole("list", { name: messages.trips.overview.modules })).getAllByRole("listitem");
    const empty = items.find((li) => li.childElementCount === 0 && li.textContent === "");
    expect(empty).toHaveClass("empty:hidden");
    expect(items.find((li) => li.textContent === "full card")).toBeDefined();
  });

  it("includes the RSVP control", () => {
    setup();

    expect(screen.getByRole("button", { name: messages.trips.rsvp.in })).toBeInTheDocument();
  });
});
