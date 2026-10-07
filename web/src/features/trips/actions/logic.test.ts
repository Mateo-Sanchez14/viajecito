import { describe, expect, it } from "vitest";
import {
  DOCUMENTS_WINDOW_DAYS,
  datesAction,
  documentsNone,
  itineraryEmpty,
  missingPrice,
  rsvpMine,
  rsvpOthers,
  tasksMine,
  tasksOverdue,
} from "./logic";

const ME = "me";
const task = (overrides: Partial<{ status: string; overdue: boolean; owner: { person_id: string } | null }> = {}) => ({
  status: "open",
  overdue: false,
  owner: null,
  ...overrides,
});

describe("rsvpMine", () => {
  it("speaks when my answer is still pending", () => {
    expect(rsvpMine("pending")).toEqual({ messageKey: "rsvpMine", target: "rsvp", tone: "accent" });
  });

  it.each(["in", "maybe", "out"] as const)("is silent once I answered %s", (answer) => {
    expect(rsvpMine(answer)).toBeNull();
  });
});

describe("rsvpOthers", () => {
  it("counts the other people who have not answered, and not me", () => {
    const people = [
      { person_id: ME, rsvp: "pending" as const },
      { person_id: "a", rsvp: "pending" as const },
      { person_id: "b", rsvp: "pending" as const },
      { person_id: "c", rsvp: "in" as const },
    ];

    expect(rsvpOthers(people, ME)).toEqual({
      messageKey: "rsvpOthers",
      values: { count: 2 },
      target: "rsvp",
      tone: "neutral",
    });
  });

  it("is silent when nobody else is pending (my own pending answer has its own rule)", () => {
    expect(rsvpOthers([{ person_id: ME, rsvp: "pending" }, { person_id: "a", rsvp: "out" }], ME)).toBeNull();
    expect(rsvpOthers([], ME)).toBeNull();
  });
});

describe("datesAction", () => {
  it("asks to define the dates when there is no departure day", () => {
    expect(datesAction(null, [])).toEqual({ messageKey: "datesUndecided", target: "dates", tone: "accent" });
    expect(datesAction(null, [{ status: "closed" }])?.messageKey).toBe("datesUndecided");
  });

  it("asks to vote when a dates decision is open", () => {
    expect(datesAction(null, [{ status: "closed" }, { status: "open" }])?.messageKey).toBe("datesVote");
  });

  it("is silent once the trip has a departure day, even with an open vote", () => {
    expect(datesAction("2027-07-01", [{ status: "open" }])).toBeNull();
  });
});

describe("missingPrice", () => {
  it("counts the proposals without a price and leads to the budget", () => {
    expect(missingPrice([{}, {}, {}])).toEqual({
      messageKey: "missingPrice",
      values: { count: 3 },
      target: "budget",
      tone: "warn",
    });
  });

  it("is silent when every proposal is priced", () => {
    expect(missingPrice([])).toBeNull();
  });
});

describe("tasksOverdue", () => {
  it("counts open overdue tasks", () => {
    const item = tasksOverdue([task({ overdue: true }), task({ overdue: true, status: "blocked" }), task()]);

    expect(item).toEqual({ messageKey: "tasksOverdue", values: { count: 2 }, target: "logistics", tone: "warn" });
  });

  it("never counts done tasks, even when flagged overdue", () => {
    expect(tasksOverdue([task({ status: "done", overdue: true })])).toBeNull();
  });

  it("treats a task due today as open, not overdue (the api flags only past days)", () => {
    expect(tasksOverdue([task({ overdue: false })])).toBeNull();
  });

  it("is silent without tasks", () => {
    expect(tasksOverdue([])).toBeNull();
  });
});

describe("tasksMine", () => {
  it("counts my open tasks", () => {
    const item = tasksMine(
      [task({ owner: { person_id: ME } }), task({ owner: { person_id: ME }, status: "blocked" }), task({ owner: { person_id: "x" } }), task()],
      ME,
    );

    expect(item).toEqual({ messageKey: "tasksMine", values: { count: 2 }, target: "logistics", tone: "accent" });
  });

  it("gives way to the overdue row: it is silent while any open task is overdue", () => {
    expect(tasksMine([task({ owner: { person_id: ME } }), task({ overdue: true })], ME)).toBeNull();
  });

  it("ignores my done tasks and other people's tasks", () => {
    expect(tasksMine([task({ owner: { person_id: ME }, status: "done" }), task({ owner: { person_id: "x" } })], ME)).toBeNull();
    expect(tasksMine([], ME)).toBeNull();
  });

  it("does not let a done overdue task silence it", () => {
    expect(tasksMine([task({ owner: { person_id: ME } }), task({ overdue: true, status: "done" })], ME)?.values).toEqual({ count: 1 });
  });
});

describe("documentsNone", () => {
  const tz = "America/Argentina/Buenos_Aires";
  const now = new Date("2027-06-10T15:00:00Z");

  it("speaks when there are no documents and the trip leaves within the window", () => {
    expect(documentsNone(0, "2027-07-01", tz, now)).toEqual({ messageKey: "documentsNone", target: "documents", tone: "neutral" });
    expect(documentsNone(0, "2027-06-10", tz, now)).not.toBeNull(); // leaving today
    expect(DOCUMENTS_WINDOW_DAYS).toBe(30);
    expect(documentsNone(0, "2027-07-10", tz, now)).not.toBeNull(); // exactly 30 days
  });

  it("is silent when a document exists", () => {
    expect(documentsNone(1, "2027-07-01", tz, now)).toBeNull();
  });

  it("is silent when the trip is far away, already started or undated", () => {
    expect(documentsNone(0, "2027-07-11", tz, now)).toBeNull();
    expect(documentsNone(0, "2027-06-09", tz, now)).toBeNull();
    expect(documentsNone(0, null, tz, now)).toBeNull();
  });

  it("measures the days in the trip time zone", () => {
    // 01:00 UTC on July 10 is still July 9 in Buenos Aires: August 9 is 31 days away there (30 in UTC).
    const lateUtc = new Date("2027-07-10T01:00:00Z");
    expect(documentsNone(0, "2027-08-08", tz, lateUtc)).not.toBeNull();
    expect(documentsNone(0, "2027-08-09", tz, lateUtc)).toBeNull();
  });
});

describe("itineraryEmpty", () => {
  const empty = { days: [{ entries: [] }, { entries: [] }], tray: [], out_of_range: [] };

  it("speaks for a dated trip with no entry anywhere", () => {
    expect(itineraryEmpty(empty, "2027-07-01")).toEqual({ messageKey: "itineraryEmpty", target: "itinerary", tone: "neutral" });
  });

  it("is silent when any day, the tray or the out-of-range list has an entry", () => {
    expect(itineraryEmpty({ ...empty, days: [{ entries: [{}] }] }, "2027-07-01")).toBeNull();
    expect(itineraryEmpty({ ...empty, tray: [{}] }, "2027-07-01")).toBeNull();
    expect(itineraryEmpty({ ...empty, out_of_range: [{}] }, "2027-07-01")).toBeNull();
  });

  it("is silent while the trip has no dates", () => {
    expect(itineraryEmpty(empty, null)).toBeNull();
  });
});
