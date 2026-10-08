import { describe, expect, it } from "vitest";
import { TOUR_ANCHOR } from "@/shared/lib/tourAnchors";
import messages from "../../../../messages/es-AR";
import { TOUR_STEPS } from "./steps";
import { TOUR_VERSION } from "./version";

describe("the tour definition", () => {
  it("has exactly five steps, in page order, each bound to its data-tour anchor", () => {
    expect(TOUR_STEPS.map((step) => [step.id, step.anchor])).toEqual([
      ["nav", "nav"],
      ["cover", "cover"],
      ["nextActions", "next-actions"],
      ["rsvp", "rsvp"],
      ["capture", "capture"],
    ]);
    expect(Object.values(TOUR_ANCHOR).sort()).toEqual(TOUR_STEPS.map((step) => step.anchor).sort());
  });

  it("has a title and a body for every step", () => {
    for (const step of TOUR_STEPS) {
      const copy = messages.onboarding.steps[step.id];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it("has a version the api can store (positive, at most a smallint)", () => {
    expect(Number.isInteger(TOUR_VERSION)).toBe(true);
    expect(TOUR_VERSION).toBeGreaterThanOrEqual(1);
    expect(TOUR_VERSION).toBeLessThanOrEqual(32767);
  });
});
