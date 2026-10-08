import { describe, expect, it } from "vitest";
import { makeSummary } from "../fixtures";
import { pickNextTrip } from "./nextTrip";

const ZONE = "America/Argentina/Buenos_Aires";
// Noon in Buenos Aires on 2027-06-21.
const NOW = new Date("2027-06-21T15:00:00Z");
const NONE = new Set<string>();

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (offset: number) => {
  const date = new Date(Date.UTC(2027, 5, 21 + offset));
  return date.toISOString().slice(0, 10);
};
const trip = (n: number, startOffset: number | null, endOffset: number | null = startOffset, extra = {}) =>
  makeSummary({
    id: id(n),
    name: `Trip ${n}`,
    start_on: startOffset === null ? null : day(startOffset),
    end_on: endOffset === null ? null : day(endOffset),
    ...extra,
  });
const pick = (trips: ReturnType<typeof trip>[], defaults = NONE) =>
  pickNextTrip([{ crewId: "crew-a", trips }], defaults, ZONE, NOW);

describe("pickNextTrip", () => {
  it("picks the earliest of trips 30, 5 and 12 days away", () => {
    const result = pick([trip(1, 30), trip(2, 5), trip(3, 12)]);

    expect(result?.trip.id).toBe(id(2));
    expect(result?.countdown).toEqual({ kind: "upcoming", days: 5 });
    expect(result?.crewId).toBe("crew-a");
  });

  it("prefers an ongoing trip over a future one", () => {
    const result = pick([trip(1, 3), trip(2, -2, 4)]);

    expect(result?.trip.id).toBe(id(2));
    expect(result?.countdown.kind).toBe("ongoing");
  });

  it("treats leaving today as ahead of anything upcoming", () => {
    expect(pick([trip(1, 2), trip(2, 0, 3)])?.trip.id).toBe(id(2));
  });

  it("excludes done trips, finished trips and trips without a start date", () => {
    const result = pick([
      trip(1, 5, 8, { status: "done" }),
      trip(2, -10, -5),
      trip(3, null),
      trip(4, 9),
    ]);

    expect(result?.trip.id).toBe(id(4));
    expect(pick([trip(1, 5, 8, { status: "done" }), trip(2, -10, -5), trip(3, null)])).toBeNull();
  });

  it("picks the earliest across two crews", () => {
    const result = pickNextTrip(
      [
        { crewId: "crew-a", trips: [trip(1, 20)] },
        { crewId: "crew-b", trips: [trip(2, 6)] },
      ],
      NONE,
      ZONE,
      NOW,
    );

    expect(result?.crewId).toBe("crew-b");
    expect(result?.trip.id).toBe(id(2));
  });

  it("breaks a same-day tie by the default trip, then the name, then the id", () => {
    const a = trip(1, 7, 7, { name: "Beta" });
    const b = trip(2, 7, 7, { name: "Alfa" });
    expect(pick([a, b])?.trip.name).toBe("Alfa");
    expect(pick([a, b], new Set([a.id]))?.trip.name).toBe("Beta");

    const first = trip(3, 7, 7, { name: "Same" });
    const second = trip(4, 7, 7, { name: "Same" });
    expect(pick([second, first])?.trip.id).toBe(id(3));
  });

  it("returns null when there is nothing to feature", () => {
    expect(pick([])).toBeNull();
    expect(pickNextTrip([], NONE, ZONE, NOW)).toBeNull();
  });
});
