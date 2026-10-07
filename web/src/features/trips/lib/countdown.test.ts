import { describe, expect, it } from "vitest";
import { tripCountdown } from "./countdown";

const BA = "America/Argentina/Buenos_Aires";
// Noon in Buenos Aires keeps every case clear of the UTC day boundary.
const day = (iso: string) => new Date(`${iso}T15:00:00Z`);

describe("tripCountdown", () => {
  it("counts the days until an upcoming trip", () => {
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2026-10-07"))).toEqual({ kind: "upcoming", days: 10 });
  });

  it("is upcoming with 1 day the day before leaving", () => {
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2026-10-16"))).toEqual({ kind: "upcoming", days: 1 });
  });

  it("is today on the start day", () => {
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2026-10-17"))).toEqual({ kind: "today" });
  });

  it("is ongoing from the day after the start to the end day, inclusive", () => {
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2026-10-18"))).toEqual({
      kind: "ongoing",
      day: 2,
      total: 8,
    });
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2026-10-24"))).toEqual({
      kind: "ongoing",
      day: 8,
      total: 8,
    });
  });

  it("is done after the end day and never negative", () => {
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2026-10-25"))).toEqual({ kind: "done" });
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, day("2027-03-01"))).toEqual({ kind: "done" });
  });

  it("is done the day after a trip that has a start but no end", () => {
    expect(tripCountdown("2026-10-17", null, BA, day("2026-10-18"))).toEqual({ kind: "done" });
  });

  it("is undated without a start, even when an end is known", () => {
    expect(tripCountdown(null, null, BA, day("2026-10-07"))).toEqual({ kind: "undated" });
    expect(tripCountdown(null, "2026-10-24", BA, day("2026-10-07"))).toEqual({ kind: "undated" });
  });

  it("uses the trip time zone for today, not UTC", () => {
    // 01:30 UTC on Oct 17 is still Oct 16 in Buenos Aires.
    expect(tripCountdown("2026-10-17", "2026-10-24", BA, new Date("2026-10-17T01:30:00Z"))).toEqual({
      kind: "upcoming",
      days: 1,
    });
  });
});
