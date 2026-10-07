import { describe, expect, it } from "vitest";
import { packingStat, peopleStat, proposalsStat, tasksStat } from "./logic";

describe("peopleStat", () => {
  it("counts participants that said yes out of everyone, as a 0..1 progress", () => {
    const stat = peopleStat([
      { rsvp: "in" },
      { rsvp: "in" },
      { rsvp: "in" },
      { rsvp: "maybe" },
      { rsvp: "pending" },
    ]);

    expect(stat).toEqual({ value: 3, total: 5, progress: 0.6 });
  });

  it("is zero without NaN when nobody is on the trip", () => {
    expect(peopleStat([])).toEqual({ value: 0, total: 0, progress: 0 });
  });
});

describe("proposalsStat", () => {
  it("decided is chosen plus booked, open is proposed plus discussing, discarded is ignored", () => {
    const stat = proposalsStat({ proposed: 2, discussing: 1, chosen: 2, booked: 1, discarded: 7 });

    expect(stat).toEqual({ value: 3, open: 3, total: 6, progress: 0.5 });
  });

  it("defaults missing statuses to zero and never divides by zero", () => {
    expect(proposalsStat({})).toEqual({ value: 0, open: 0, total: 0, progress: 0 });
    expect(proposalsStat({ discarded: 4 })).toEqual({ value: 0, open: 0, total: 0, progress: 0 });
  });
});

describe("tasksStat", () => {
  it("counts done tasks and the open ones that are overdue", () => {
    const stat = tasksStat([
      { status: "done", overdue: false },
      { status: "done", overdue: true },
      { status: "open", overdue: true },
      { status: "open", overdue: false },
    ]);

    expect(stat).toEqual({ value: 2, total: 4, overdue: 1, progress: 0.5 });
  });

  it("is zero without NaN for no tasks", () => {
    expect(tasksStat([])).toEqual({ value: 0, total: 0, overdue: 0, progress: 0 });
  });
});

describe("packingStat", () => {
  const summary = [
    { person: { person_id: "a" }, packed: 3, total: 4 },
    { person: { person_id: "b" }, packed: 0, total: 0 },
  ];

  it("picks my entry of the crew summary", () => {
    expect(packingStat(summary, "a")).toEqual({ value: 3, total: 4, progress: 0.75 });
  });

  it("handles an empty list without NaN", () => {
    expect(packingStat(summary, "b")).toEqual({ value: 0, total: 0, progress: 0 });
  });

  it("is null when I am not in the summary", () => {
    expect(packingStat(summary, "zzz")).toBeNull();
  });
});
