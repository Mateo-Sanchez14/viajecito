import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeBudget } from "@/features/budget/test/handlers";
import { makeDecision } from "@/features/dates/test/handlers";
import { makeTask } from "@/features/logistics/test/handlers";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import type { TripAction } from "../actions/types";
import { tripActions } from "../actions";
import { CREW_ID, TRIP_ID, makeMe, makeTrip } from "../fixtures";
import { TripProvider } from "../TripProvider";
import { NextActions } from "./NextActions";
import { TripShellContainer } from "./TripShellContainer";

vi.mock("next/navigation", () => ({ usePathname: () => `/crews/${CREW_ID}/trips/${TRIP_ID}` }));
vi.mock("@/shared/lib/useClientNow", () => ({ useClientNow: () => new Date("2027-06-10T15:00:00Z") }));

const t = messages.trips.actions;
const rule = (key: string, order: number, module?: string, text = key): TripAction => ({
  key,
  module,
  order,
  Component: () => <p>{text}</p>,
});

function setup(actions: TripAction[], trip = makeTrip()) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <NextActions actions={actions} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("NextActions", () => {
  it("renders a labelled section with one row per applicable rule, in ascending order", () => {
    setup([rule("c", 30), rule("a", 10), rule("b", 20)]);

    const section = screen.getByRole("region", { name: t.title });
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["a", "b", "c"]);
  });

  it("does not render a rule whose module the trip does not have", () => {
    setup([rule("docs", 10, "documents"), rule("always", 20)], makeTrip({ modules: ["dates"] }));

    expect(screen.queryByText("docs")).not.toBeInTheDocument();
    expect(screen.getByText("always")).toBeInTheDocument();
  });

  it("keeps a list item for a rule with nothing to say, hidden when empty", () => {
    setup([{ key: "quiet", order: 1, Component: () => null }, rule("loud", 2)]);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    const quiet = items.find((item) => item.textContent === "");
    expect(quiet).toBeEmptyDOMElement();
    expect(quiet).toHaveClass("empty:hidden");
  });

  it("renders nothing when no rule is registered", () => {
    const { container } = setup([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no rule matches the trip's modules", () => {
    setup([rule("docs", 1, "documents")], makeTrip({ modules: [] }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("is hidden for a finished trip", () => {
    setup([rule("a", 1)], makeTrip({ status: "done" }));

    expect(screen.queryByRole("region", { name: t.title })).not.toBeInTheDocument();
    expect(screen.queryByText("a")).not.toBeInTheDocument();
  });

  it("passes the trip and crew ids to each rule", () => {
    setup([{ key: "ids", order: 1, Component: ({ tripId, crewId }) => <p>{`${tripId} ${crewId}`}</p> }]);

    expect(screen.getByText(`${TRIP_ID} ${CREW_ID}`)).toBeInTheDocument();
  });

  describe("with the real rules", () => {
    const pending = makeTrip({ my_rsvp: "pending", start_on: null, end_on: null, participants: [] });

    it("shows rows from the rules that apply, in registry order, and none for those that fail", async () => {
      server.use(
        http.get("*/api/trips/:id/decisions", () => HttpResponse.json([makeDecision({ status: "open" })])),
        http.get("*/api/trips/:id/budget", () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })),
        http.get("*/api/trips/:id/tasks", () => HttpResponse.json([makeTask({ overdue: true })])),
        http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
        http.get("*/api/trips/:id/itinerary", () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })),
      );
      setup(tripActions, pending);

      const section = screen.getByRole("region", { name: t.title });
      await waitFor(() => expect(within(section).getAllByRole("link")).toHaveLength(3));
      const links = within(section).getAllByRole("link");
      expect(links[0]).toHaveTextContent(t.rsvpMine);
      expect(links[1]).toHaveTextContent(t.datesVote);
      expect(links[2]).toHaveTextContent("1 tarea vencida");
    });

    it("adds no link named after the overview section", async () => {
      server.use(
        http.get("*/api/trips/:id/decisions", () => HttpResponse.json([])),
        http.get("*/api/trips/:id/budget", () => HttpResponse.json(makeBudget({ missing_price: [{ proposal_id: "p", title: "P" }] }))),
        http.get("*/api/trips/:id/tasks", () => HttpResponse.json([makeTask({ overdue: true })])),
        http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
        http.get("*/api/trips/:id/itinerary", () => HttpResponse.json({ timezone: "UTC", start_on: null, end_on: null, days: [], tray: [], out_of_range: [] })),
      );
      renderWithProviders(
        <MeProvider me={makeMe()}>
          <TripProvider trip={makeTrip({ my_rsvp: "pending", start_on: null, end_on: null })}>
            <TripShellContainer>
              <NextActions />
            </TripShellContainer>
          </TripProvider>
        </MeProvider>,
      );

      const section = screen.getByRole("region", { name: t.title });
      await within(section).findByRole("link", { name: new RegExp("tarea vencida") });
      for (const link of within(section).getAllByRole("link")) {
        expect(link).not.toHaveAccessibleName(messages.trips.modules.overview);
      }
      // The shell's two navigations each carry their own "Resumen" link: the rows add none.
      expect(screen.getAllByRole("link", { name: messages.trips.modules.overview })).toHaveLength(2);
    });
  });
});
