import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeTask } from "@/features/logistics/test/handlers";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, makeMe, makeTrip, PERSON_ID, TRIP_ID } from "../fixtures";
import { TripProvider } from "../TripProvider";
import { PackingStat } from "./PackingStat";
import { PeopleStat } from "./PeopleStat";
import { ProposalsStat } from "./ProposalsStat";
import { TasksStat } from "./TasksStat";
import { tripStats } from "./index";

const base = `/crews/${CREW_ID}/trips/${TRIP_ID}`;

function setup(ui: React.ReactElement, trip = makeTrip()) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>{ui}</TripProvider>
    </MeProvider>,
  );
}

describe("PeopleStat", () => {
  it("shows the people who said yes, with a progress meter, and links to the RSVP section", () => {
    setup(<PeopleStat tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#rsvp");
    expect(link).toHaveTextContent("1");
    expect(link).toHaveTextContent("van");
    expect(link).toHaveTextContent("de 2");
    expect(screen.getByRole("progressbar", { name: messages.trips.stats.people.progress })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });
});

describe("ProposalsStat", () => {
  it("shows a loading card first and then the decided proposals", async () => {
    server.use(
      http.get("*/api/trips/:id/proposals/summary", () =>
        HttpResponse.json({ counts: { chosen: 2, booked: 1, proposed: 3 }, top: [] }),
      ),
    );
    const { container } = setup(<ProposalsStat tripId={TRIP_ID} crewId={CREW_ID} />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", `${base}/proposals`);
    expect(link).toHaveTextContent("3");
    expect(link).toHaveTextContent("propuestas decididas");
    expect(link).toHaveTextContent("3 abiertas");
    expect(screen.getByRole("progressbar", { name: messages.trips.stats.proposals.progress })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("shows zero with an empty meter and no NaN when there are no proposals", async () => {
    server.use(
      http.get("*/api/trips/:id/proposals/summary", () => HttpResponse.json({ counts: {}, top: [] })),
    );
    const { container } = setup(<ProposalsStat tripId={TRIP_ID} crewId={CREW_ID} />);

    await screen.findByRole("link");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("renders nothing when the summary cannot load (the module card shows the error)", async () => {
    server.use(
      http.get("*/api/trips/:id/proposals/summary", () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    );
    const { container } = setup(<ProposalsStat tripId={TRIP_ID} crewId={CREW_ID} />);

    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeNull());
    expect(container.querySelector(".stat-card")).toBeNull();
  });
});

describe("TasksStat", () => {
  it("shows tasks done and flags the overdue ones", async () => {
    server.use(
      http.get("*/api/trips/:id/tasks", () =>
        HttpResponse.json([
          makeTask({ id: "1", status: "done" }),
          makeTask({ id: "2", status: "open", overdue: true }),
          makeTask({ id: "3", status: "open" }),
        ]),
      ),
    );
    setup(<TasksStat tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", `${base}/logistics`);
    expect(link).toHaveTextContent("1");
    expect(link).toHaveTextContent("tarea hecha");
    expect(link).toHaveTextContent("1 vencida");
    expect(screen.getByRole("progressbar", { name: messages.trips.stats.tasks.progress })).toHaveAttribute(
      "aria-valuenow",
      "33",
    );
  });

  it("falls back to the total when nothing is overdue", async () => {
    server.use(
      http.get("*/api/trips/:id/tasks", () =>
        HttpResponse.json([makeTask({ id: "1", status: "done" }), makeTask({ id: "2", status: "open" })]),
      ),
    );
    setup(<TasksStat tripId={TRIP_ID} crewId={CREW_ID} />);

    expect(await screen.findByRole("link")).toHaveTextContent("de 2");
  });
});

describe("PackingStat", () => {
  it("shows my own packing progress", async () => {
    server.use(
      http.get("*/api/trips/:id/packing/summary", () =>
        HttpResponse.json([
          { person: { person_id: PERSON_ID, display_name: "Mateo" }, packed: 2, total: 8 },
          { person: { person_id: "other", display_name: "Lu" }, packed: 8, total: 8 },
        ]),
      ),
    );
    setup(<PackingStat tripId={TRIP_ID} crewId={CREW_ID} />);

    const link = await screen.findByRole("link");
    expect(link).toHaveTextContent("2");
    expect(link).toHaveTextContent("en tu valija");
    expect(link).toHaveTextContent("de 8");
    expect(screen.getByRole("progressbar", { name: messages.trips.stats.packing.progress })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("renders nothing when I am not in the summary", async () => {
    server.use(http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])));
    const { container } = setup(<PackingStat tripId={TRIP_ID} crewId={CREW_ID} />);

    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeNull());
    expect(container.querySelector(".stat-card")).toBeNull();
  });
});

describe("tripStats registry", () => {
  it("lists people, proposals, tasks and packing in order, gated by their modules", () => {
    expect(tripStats.map(({ key, module, order }) => ({ key, module, order }))).toEqual([
      { key: "people", module: undefined, order: 10 },
      { key: "proposals", module: "proposals", order: 20 },
      { key: "tasks", module: "logistics", order: 30 },
      { key: "packing", module: "logistics", order: 40 },
    ]);
  });
});
