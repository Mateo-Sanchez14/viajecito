import { screen, within } from "@testing-library/react";
import type { TripCard } from "../cards/types";
import type { TripAction } from "../actions/types";
import type { TripStat } from "../stats/types";
import { describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { TripProvider } from "../TripProvider";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeTrip } from "../fixtures";
import { TripOverview } from "./TripOverview";

function setup(trip = makeTrip(), cards: TripCard[] = [], stats: TripStat[] = [], actions: TripAction[] = []) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <TripOverview cards={cards} stats={stats} actions={actions} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("TripOverview", () => {
  it("shows dates and destination exactly once", () => {
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

  it("marks the RSVP control as the tour's rsvp anchor", () => {
    setup();

    const group = screen.getByRole("group", { name: messages.trips.rsvp.label });
    expect(group.parentElement).toHaveAttribute("data-tour", "rsvp");
  });

  it("includes the RSVP control", () => {
    setup();

    expect(screen.getByRole("button", { name: messages.trips.rsvp.in })).toBeInTheDocument();
  });

  it("hosts the RSVP control in the crew section that the stats link to", () => {
    setup();

    const crew = screen.getByRole("heading", { name: messages.trips.overview.participants }).closest("section");
    expect(crew).toHaveAttribute("id", "rsvp");
    expect(within(crew as HTMLElement).getByRole("button", { name: messages.trips.rsvp.in })).toBeInTheDocument();
  });

  it("renders the hero with the dates, destination and currency as facts", () => {
    setup();

    const facts = screen.getByText(messages.trips.hero.facts.destination).closest("dl") as HTMLElement;
    expect(within(facts).getByText("Bariloche")).toBeInTheDocument();
    expect(within(facts).getByText("USD")).toBeInTheDocument();
    expect(within(facts).getByText(messages.trips.hero.facts.dates)).toBeInTheDocument();
  });

  it("renders registered stats", () => {
    setup(makeTrip(), [], [{ key: "x", order: 1, Component: () => <p>stat x</p> }]);

    expect(screen.getByText("stat x")).toBeInTheDocument();
  });

  it("renders the next actions between the stats and the crew", () => {
    setup(makeTrip(), [], [], [{ key: "a", order: 1, Component: () => <p>action a</p> }]);

    const section = screen.getByRole("heading", { name: messages.trips.actions.title }).closest("section") as HTMLElement;
    expect(within(section).getByText("action a")).toBeInTheDocument();
    const crew = screen.getByRole("heading", { name: messages.trips.overview.participants });
    expect(section.compareDocumentPosition(crew) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("adds no navigation link named after the overview section", () => {
    setup();

    expect(screen.queryByRole("link", { name: messages.trips.modules.overview })).not.toBeInTheDocument();
  });

  it("renders no modules section when there is nothing to list", () => {
    setup(makeTrip({ modules: [] }), []);

    expect(screen.queryByRole("heading", { name: messages.trips.overview.modules })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: messages.trips.overview.modules })).not.toBeInTheDocument();
  });
});
