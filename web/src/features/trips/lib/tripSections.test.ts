import { describe, expect, it } from "vitest";
import { makeSummary } from "../fixtures";
import { groupTrips } from "./tripSections";

const NOW = new Date("2027-06-15T15:00:00Z");
const TZ = "UTC";
const trip = (id: string, overrides: Parameters<typeof makeSummary>[0] = {}) =>
  makeSummary({ id, name: id, ...overrides });
const ids = (entries: { trip: { id: string } }[]) => entries.map((entry) => entry.trip.id);

describe("groupTrips", () => {
  it("splits trips into upcoming, undated and past", () => {
    const sections = groupTrips(
      [
        trip("later", { start_on: "2027-09-01", end_on: "2027-09-08" }),
        trip("gone", { start_on: "2027-01-01", end_on: "2027-01-05", status: "planning" }),
        trip("idea", { start_on: null, end_on: null, status: "idea" }),
      ],
      NOW,
      TZ,
    );

    expect(ids(sections.upcoming)).toEqual(["later"]);
    expect(ids(sections.undated)).toEqual(["idea"]);
    expect(ids(sections.past)).toEqual(["gone"]);
  });

  it("sorts upcoming by start date, with trips in progress first", () => {
    const sections = groupTrips(
      [
        trip("sept", { start_on: "2027-09-01", end_on: "2027-09-04" }),
        trip("july", { start_on: "2027-07-10", end_on: "2027-07-12" }),
        trip("now", { start_on: "2027-06-14", end_on: "2027-06-20" }),
        trip("today", { start_on: "2027-06-15", end_on: "2027-06-16" }),
      ],
      NOW,
      TZ,
    );

    expect(ids(sections.upcoming)).toEqual(["now", "today", "july", "sept"]);
    expect(sections.upcoming[0].countdown?.kind).toBe("ongoing");
    expect(sections.upcoming[1].countdown?.kind).toBe("today");
  });

  it("sorts past trips with the most recent first, by their last day", () => {
    const sections = groupTrips(
      [
        trip("old", { start_on: "2026-01-01", end_on: "2026-01-10" }),
        trip("recent", { start_on: "2027-05-01", end_on: "2027-05-03" }),
        trip("single", { start_on: "2027-06-01", end_on: null }),
      ],
      NOW,
      TZ,
    );

    expect(ids(sections.past)).toEqual(["single", "recent", "old"]);
  });

  it("keeps a trip marked done in the past even when its dates are ahead or missing", () => {
    const sections = groupTrips(
      [
        trip("done-future", { start_on: "2027-09-01", end_on: "2027-09-04", status: "done" }),
        trip("done-undated", { start_on: null, end_on: null, status: "done" }),
      ],
      NOW,
      TZ,
    );

    expect(ids(sections.past).sort()).toEqual(["done-future", "done-undated"]);
    expect(sections.upcoming).toEqual([]);
    expect(sections.undated).toEqual([]);
  });

  it("keeps undated trips in the order received", () => {
    const sections = groupTrips(
      [trip("b", { start_on: null, end_on: null }), trip("a", { start_on: null, end_on: null })],
      NOW,
      TZ,
    );

    expect(ids(sections.undated)).toEqual(["b", "a"]);
  });

  it("without a clock, dated trips are all upcoming and carry no countdown", () => {
    const sections = groupTrips(
      [
        trip("gone", { start_on: "2027-01-01", end_on: "2027-01-05" }),
        trip("later", { start_on: "2027-09-01", end_on: "2027-09-08" }),
      ],
      null,
      TZ,
    );

    expect(ids(sections.upcoming)).toEqual(["gone", "later"]);
    expect(sections.upcoming.every((entry) => entry.countdown === null)).toBe(true);
    expect(sections.past).toEqual([]);
  });

  it("returns empty groups for no trips", () => {
    expect(groupTrips([], NOW, TZ)).toEqual({ upcoming: [], undated: [], past: [] });
  });
});
