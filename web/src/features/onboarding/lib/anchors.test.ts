import { afterEach, describe, expect, it } from "vitest";
import { TOUR_STEPS } from "./steps";
import { findAnchor, isVisibleAnchor, nextAvailableIndex, resolveSteps } from "./anchors";

const SIZE = { x: 0, y: 0, width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40, toJSON: () => ({}) };

/** jsdom has no layout: give an element a box (or none) the way a browser would. */
function anchor(name: string, box: Partial<typeof SIZE> | null = {}, style = "") {
  const element = document.createElement("div");
  element.dataset.tour = name;
  if (style) element.setAttribute("style", style);
  element.getBoundingClientRect = () => (box === null ? { ...SIZE, width: 0, height: 0 } : { ...SIZE, ...box }) as DOMRect;
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("isVisibleAnchor", () => {
  it("accepts an element with a real box", () => {
    expect(isVisibleAnchor(anchor("nav"))).toBe(true);
  });

  it("rejects a zero-size box, display: none and visibility: hidden", () => {
    expect(isVisibleAnchor(anchor("nav", null))).toBe(false);
    expect(isVisibleAnchor(anchor("nav", {}, "visibility: hidden"))).toBe(false);
    // display: none has no box in a browser; here its rect is zero like it would be.
    expect(isVisibleAnchor(anchor("nav", { width: 0, height: 0 }, "display: none"))).toBe(false);
  });
});

describe("findAnchor", () => {
  it("uses the visible one when two elements match (SectionNav and BottomNav)", () => {
    anchor("nav", null);
    const visible = anchor("nav");

    expect(findAnchor("nav")).toBe(visible);
  });

  it("is null when nothing matches or nothing is visible", () => {
    expect(findAnchor("rsvp")).toBeNull();
    anchor("rsvp", null);
    expect(findAnchor("rsvp")).toBeNull();
  });
});

describe("resolveSteps", () => {
  it("keeps only the steps whose anchor is on screen, in order, so the counter counts those", () => {
    anchor("nav");
    anchor("cover", null);
    anchor("rsvp");
    anchor("capture");

    expect(resolveSteps(TOUR_STEPS).map((step) => step.id)).toEqual(["nav", "rsvp", "capture"]);
  });

  it("is empty when no anchor is available", () => {
    expect(resolveSteps(TOUR_STEPS)).toEqual([]);
  });
});

describe("nextAvailableIndex", () => {
  it("moves on in the direction of travel to the nearest step that still has its anchor", () => {
    anchor("nav");
    anchor("rsvp");
    anchor("capture");

    // steps: nav, cover (gone), nextActions (gone), rsvp, capture
    expect(nextAvailableIndex(TOUR_STEPS, 1, 1)).toBe(3);
    expect(nextAvailableIndex(TOUR_STEPS, 3, -1)).toBe(0);
  });

  it("is null at the end when going forward (the tour is over)", () => {
    anchor("nav");

    expect(nextAvailableIndex(TOUR_STEPS, 2, 1)).toBeNull();
  });

  it("turns around when going back finds nothing", () => {
    anchor("rsvp");

    expect(nextAvailableIndex(TOUR_STEPS, 2, -1)).toBe(3);
  });
});
