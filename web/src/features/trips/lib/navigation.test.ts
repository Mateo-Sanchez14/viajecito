import { describe, expect, it } from "vitest";
import { PRIMARY_ONGOING, PRIMARY_PLANNING, splitNav } from "./navigation";

const item = (key: string) => ({ key });
const keys = (items: { key: string }[]) => items.map((entry) => entry.key);

const GENERIC = ["overview", "proposals", "dates", "logistics", "itinerary", "today", "budget", "documents"].map(item);

describe("splitNav", () => {
  it("puts overview first and the planning favorites next, the rest in the sheet", () => {
    const { primary, more } = splitNav(GENERIC, "planning");

    expect(keys(primary)).toEqual(["overview", "proposals", "logistics", "itinerary"]);
    expect(keys(more)).toEqual(["dates", "today", "budget", "documents"]);
  });

  it("prefers today, itinerary and documents while the trip is ongoing", () => {
    const { primary, more } = splitNav(GENERIC, "ongoing");

    expect(keys(primary)).toEqual(["overview", "today", "itinerary", "documents"]);
    expect(keys(more)).toEqual(["proposals", "dates", "logistics", "budget"]);
  });

  it("uses the planning favorites for every status that is not ongoing", () => {
    for (const status of ["idea", "planning", "booked", "done"] as const) {
      expect(keys(splitNav(GENERIC, status).primary)).toEqual(["overview", "proposals", "logistics", "itinerary"]);
    }
  });

  it("fills the bar from the module order when a favorite is missing", () => {
    const withoutItinerary = GENERIC.filter((entry) => entry.key !== "itinerary");

    const { primary, more } = splitNav(withoutItinerary, "planning");

    expect(keys(primary)).toEqual(["overview", "proposals", "logistics", "dates"]);
    expect(keys(more)).toEqual(["today", "budget", "documents"]);
  });

  it("sends plugin modules to the sheet automatically", () => {
    const ski = [...GENERIC, item("ski")];

    const { more } = splitNav(ski, "planning");

    expect(keys(more)).toContain("ski");
  });

  it("promotes a lone leftover into the bar so the sheet is never a single entry", () => {
    const small = ["overview", "proposals", "logistics", "itinerary", "budget"].map(item);

    const { primary, more } = splitNav(small, "planning");

    expect(keys(primary)).toEqual(["overview", "proposals", "logistics", "itinerary", "budget"]);
    expect(more).toEqual([]);
  });

  it("leaves the sheet empty when everything fits", () => {
    const { primary, more } = splitNav(["overview", "proposals"].map(item), "planning");

    expect(keys(primary)).toEqual(["overview", "proposals"]);
    expect(more).toEqual([]);
  });

  it("honors a smaller bar size", () => {
    const { primary, more } = splitNav(GENERIC, "planning", 2);

    expect(keys(primary)).toEqual(["overview", "proposals"]);
    expect(more).toHaveLength(6);
  });

  it("never loses or duplicates a section", () => {
    for (const status of ["planning", "ongoing"] as const) {
      const { primary, more } = splitNav(GENERIC, status);
      expect([...keys(primary), ...keys(more)].sort()).toEqual(keys(GENERIC).sort());
    }
  });

  it("exposes the preferred keys as constants", () => {
    expect(PRIMARY_PLANNING).toEqual(["proposals", "logistics", "itinerary"]);
    expect(PRIMARY_ONGOING).toEqual(["today", "itinerary", "documents"]);
  });
});
