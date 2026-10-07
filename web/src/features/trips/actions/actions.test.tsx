import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { useBudget } from "@/features/budget/hooks/useBudget";
import { makeBudget } from "@/features/budget/test/handlers";
import { useDecisions } from "@/features/dates/hooks/queries";
import { makeDecision } from "@/features/dates/test/handlers";
import { useDocuments } from "@/features/documents/hooks/useDocuments";
import { makeDocument } from "@/features/documents/test/handlers";
import { useItinerary } from "@/features/itinerary/hooks/queries";
import { makeItinerary } from "@/features/itinerary/test/handlers";
import { useTasks } from "@/features/logistics/hooks/queries";
import { makeTask } from "@/features/logistics/test/handlers";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, PERSON_ID, TRIP_ID, makeMe, makeParticipant, makeTrip } from "../fixtures";
import { TripProvider } from "../TripProvider";
import { DatesAction } from "./DatesAction";
import { DocumentsNoneAction } from "./DocumentsNoneAction";
import { ItineraryEmptyAction } from "./ItineraryEmptyAction";
import { MissingPriceAction } from "./MissingPriceAction";
import { RsvpMineAction } from "./RsvpMineAction";
import { RsvpOthersAction } from "./RsvpOthersAction";
import { TasksMineAction } from "./TasksMineAction";
import { TasksOverdueAction } from "./TasksOverdueAction";
import { tripActions } from "./index";

let now: Date | null = null;
vi.mock("@/shared/lib/useClientNow", () => ({ useClientNow: () => now }));

const t = messages.trips.actions;
const base = `/crews/${CREW_ID}/trips/${TRIP_ID}`;
const OTHER = "33333333-3333-4333-8333-333333333333";

/** Mirrors a query's status so a test can wait for the request to settle before asserting there is no row. */
function Settled({ use }: { use: () => { status: string } }) {
  return <output data-testid="settled">{use().status}</output>;
}

function setup(ui: ReactElement, { trip = makeTrip(), settle }: { trip?: ReturnType<typeof makeTrip>; settle?: () => { status: string } } = {}) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <div data-testid="row">{ui}</div>
        {settle && <Settled use={settle} />}
      </TripProvider>
    </MeProvider>,
  );
}

const row = () => screen.getByTestId("row");
const settled = () =>
  waitFor(() => expect(screen.getByTestId("settled")).toHaveTextContent(/^(success|error)$/));

beforeEach(() => {
  now = new Date("2027-06-10T15:00:00Z");
});

describe("RsvpMineAction", () => {
  it("renders a row linking to the RSVP block while my answer is pending", () => {
    setup(<RsvpMineAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: makeTrip({ my_rsvp: "pending" }) });

    expect(screen.getByRole("link", { name: new RegExp(t.rsvpMine) })).toHaveAttribute("href", "#rsvp");
  });

  it("renders nothing once I answered", () => {
    setup(<RsvpMineAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: makeTrip({ my_rsvp: "in" }) });

    expect(row()).toBeEmptyDOMElement();
  });
});

describe("RsvpOthersAction", () => {
  const people = (others: ("pending" | "in")[]) => [
    makeParticipant({ rsvp: "pending" }),
    ...others.map((rsvp, index) => makeParticipant({ person_id: `${OTHER}-${index}`, display_name: `P${index}`, rsvp })),
  ];

  it("counts the others who have not answered, with plural copy", () => {
    setup(<RsvpOthersAction tripId={TRIP_ID} crewId={CREW_ID} />, {
      trip: makeTrip({ participants: people(["pending", "pending", "in"]) }),
    });

    const link = screen.getByRole("link", { name: new RegExp("2 personas sin responder") });
    expect(link).toHaveAttribute("href", "#rsvp");
  });

  it("uses the singular for one person", () => {
    setup(<RsvpOthersAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: makeTrip({ participants: people(["pending"]) }) });

    expect(screen.getByRole("link", { name: new RegExp("1 persona sin responder") })).toBeInTheDocument();
  });

  it("renders nothing when only I am pending", () => {
    setup(<RsvpOthersAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: makeTrip({ participants: people(["in"]) }) });

    expect(row()).toBeEmptyDOMElement();
  });
});

describe("DatesAction", () => {
  const dates = (decisions: ReturnType<typeof makeDecision>[]) =>
    server.use(http.get("*/api/trips/:id/decisions", () => HttpResponse.json(decisions)));
  const useSettle = () => useDecisions(TRIP_ID);
  const undated = makeTrip({ start_on: null, end_on: null });

  it("asks to define the dates when the trip has no departure day", async () => {
    dates([]);
    setup(<DatesAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: undated });

    const link = await screen.findByRole("link", { name: new RegExp(t.datesUndecided) });
    expect(link).toHaveAttribute("href", `${base}/dates`);
  });

  it("asks to vote when a dates decision is open", async () => {
    dates([makeDecision({ status: "open" })]);
    setup(<DatesAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: undated });

    expect(await screen.findByRole("link", { name: new RegExp(t.datesVote) })).toHaveAttribute("href", `${base}/dates`);
  });

  it("renders nothing when the trip already has dates", async () => {
    dates([makeDecision({ status: "open" })]);
    setup(<DatesAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("renders nothing while the decisions load (no flash)", () => {
    dates([]);
    setup(<DatesAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: undated });

    expect(row()).toBeEmptyDOMElement();
  });

  it("renders nothing when the decisions cannot load", async () => {
    server.use(http.get("*/api/trips/:id/decisions", () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })));
    setup(<DatesAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: undated, settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });
});

describe("MissingPriceAction", () => {
  const useSettle = () => useBudget(TRIP_ID);
  const missing = (count: number) =>
    server.use(
      http.get("*/api/trips/:id/budget", () =>
        HttpResponse.json(
          makeBudget({
            missing_price: Array.from({ length: count }, (_, index) => ({
              proposal_id: `p${index}`,
              title: `P${index}`,
            })),
          }),
        ),
      ),
    );

  it("states how many chosen proposals have no price and leads to the budget", async () => {
    missing(3);
    setup(<MissingPriceAction tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: new RegExp("Faltan los precios de 3 propuestas") });
    expect(link).toHaveAttribute("href", `${base}/budget`);
  });

  it("uses the singular for one proposal", async () => {
    missing(1);
    setup(<MissingPriceAction tripId={TRIP_ID} crewId={CREW_ID} />);

    expect(await screen.findByRole("link", { name: new RegExp("Falta el precio de 1 propuesta") })).toBeInTheDocument();
  });

  it("renders nothing when every proposal is priced", async () => {
    missing(0);
    setup(<MissingPriceAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("renders nothing when the budget cannot load", async () => {
    server.use(http.get("*/api/trips/:id/budget", () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })));
    setup(<MissingPriceAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });
});

describe("tasks rules", () => {
  const useSettle = () => useTasks(TRIP_ID);
  const tasks = (list: ReturnType<typeof makeTask>[]) =>
    server.use(http.get("*/api/trips/:id/tasks", () => HttpResponse.json(list)));
  const mine = { person_id: PERSON_ID, display_name: "Mateo" };

  it("TasksOverdueAction counts open overdue tasks and leads to logistics", async () => {
    tasks([makeTask({ id: "1", overdue: true }), makeTask({ id: "2", overdue: true }), makeTask({ id: "3" })]);
    setup(<TasksOverdueAction tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: new RegExp("2 tareas vencidas") });
    expect(link).toHaveAttribute("href", `${base}/logistics`);
  });

  it("TasksOverdueAction ignores done tasks and renders nothing without overdue ones", async () => {
    tasks([makeTask({ id: "1", status: "done", overdue: true }), makeTask({ id: "2" })]);
    setup(<TasksOverdueAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("TasksMineAction counts my open tasks", async () => {
    tasks([makeTask({ id: "1", owner: mine }), makeTask({ id: "2", owner: mine }), makeTask({ id: "3", owner: mine }), makeTask({ id: "4" })]);
    setup(<TasksMineAction tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: new RegExp("Tenés 3 tareas pendientes") });
    expect(link).toHaveAttribute("href", `${base}/logistics`);
  });

  it("TasksMineAction gives way to the overdue row and ignores done tasks", async () => {
    tasks([makeTask({ id: "1", owner: mine }), makeTask({ id: "2", overdue: true })]);
    setup(<TasksMineAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("TasksMineAction renders nothing when all my tasks are done", async () => {
    tasks([makeTask({ id: "1", owner: mine, status: "done" })]);
    setup(<TasksMineAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("render nothing while the tasks load", () => {
    tasks([makeTask({ overdue: true })]);
    setup(
      <>
        <TasksOverdueAction tripId={TRIP_ID} crewId={CREW_ID} />
        <TasksMineAction tripId={TRIP_ID} crewId={CREW_ID} />
      </>,
    );

    expect(row()).toBeEmptyDOMElement();
  });

  it("render nothing when the tasks cannot load", async () => {
    server.use(http.get("*/api/trips/:id/tasks", () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })));
    setup(
      <>
        <TasksOverdueAction tripId={TRIP_ID} crewId={CREW_ID} />
        <TasksMineAction tripId={TRIP_ID} crewId={CREW_ID} />
      </>,
      { settle: useSettle },
    );

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });
});

describe("DocumentsNoneAction", () => {
  const useSettle = () => useDocuments(TRIP_ID);
  const documents = (list: ReturnType<typeof makeDocument>[]) =>
    server.use(http.get("*/api/trips/:id/documents", () => HttpResponse.json(list)));
  const soon = makeTrip({ start_on: "2027-06-25", end_on: "2027-07-02" });

  it("asks for documents when there are none and the trip is close", async () => {
    documents([]);
    setup(<DocumentsNoneAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: soon });

    const link = await screen.findByRole("link", { name: new RegExp(t.documentsNone) });
    expect(link).toHaveAttribute("href", `${base}/documents`);
  });

  it("renders nothing once there is a document", async () => {
    documents([makeDocument()]);
    setup(<DocumentsNoneAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: soon, settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("renders nothing when the trip is months away", async () => {
    documents([]);
    setup(<DocumentsNoneAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: makeTrip({ start_on: "2027-12-01" }), settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("renders nothing without a client clock (server render)", async () => {
    now = null;
    documents([]);
    setup(<DocumentsNoneAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: soon, settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });
});

describe("ItineraryEmptyAction", () => {
  const useSettle = () => useItinerary(TRIP_ID);
  const itinerary = (value: ReturnType<typeof makeItinerary>) =>
    server.use(http.get("*/api/trips/:id/itinerary", () => HttpResponse.json(value)));

  it("asks to build the itinerary when no day, tray or stray entry exists", async () => {
    itinerary(makeItinerary({ days: [{ date: "2027-07-01", title: "", notes: "", is_virtual: false, entries: [] }], tray: [] }));
    setup(<ItineraryEmptyAction tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: new RegExp(t.itineraryEmpty) });
    expect(link).toHaveAttribute("href", `${base}/itinerary`);
  });

  it("renders nothing when there is an entry", async () => {
    itinerary(makeItinerary());
    setup(<ItineraryEmptyAction tripId={TRIP_ID} crewId={CREW_ID} />, { settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });

  it("renders nothing for an undated trip", async () => {
    itinerary(makeItinerary({ days: [], tray: [] }));
    setup(<ItineraryEmptyAction tripId={TRIP_ID} crewId={CREW_ID} />, { trip: makeTrip({ start_on: null, end_on: null }), settle: useSettle });

    await settled();
    expect(row()).toBeEmptyDOMElement();
  });
});

describe("tripActions registry", () => {
  it("lists the eight rules in order, gated by their modules", () => {
    expect(tripActions.map(({ key, module, order }) => ({ key, module, order }))).toEqual([
      { key: "rsvp-mine", module: undefined, order: 1 },
      { key: "rsvp-others", module: undefined, order: 5 },
      { key: "dates", module: "dates", order: 10 },
      { key: "missing-price", module: "budget", order: 20 },
      { key: "tasks-overdue", module: "logistics", order: 30 },
      { key: "tasks-mine", module: "logistics", order: 31 },
      { key: "documents-none", module: "documents", order: 40 },
      { key: "itinerary-empty", module: "itinerary", order: 50 },
    ]);
  });
});
