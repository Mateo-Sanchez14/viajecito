import type { TourAnchor } from "@/shared/lib/tourAnchors";
import type { TourStep } from "./steps";

/** Rendered with a real box and not hidden: `display: none`, zero-size and `visibility: hidden` all fail. */
export function isVisibleAnchor(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

/** The first visible element carrying the anchor (SectionNav and BottomNav share one: only one shows). */
export function findAnchor(anchor: TourAnchor, root: ParentNode = document): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)].find(isVisibleAnchor) ?? null;
}

/** The steps whose anchor is on screen right now: the tour counts only these. */
export function resolveSteps(steps: readonly TourStep[], root?: ParentNode): TourStep[] {
  return steps.filter((step) => findAnchor(step.anchor, root) !== null);
}

/**
 * Where to go when the current step lost its anchor: the nearest step in the direction of travel
 * whose anchor is available, or the nearest one the other way, or null when nothing is left.
 */
export function nextAvailableIndex(
  steps: readonly TourStep[],
  from: number,
  direction: 1 | -1,
  root?: ParentNode,
): number | null {
  for (const way of [direction, -direction] as const) {
    for (let index = from + way; index >= 0 && index < steps.length; index += way) {
      if (findAnchor(steps[index].anchor, root) !== null) return index;
    }
    // Going on from the end means the tour is over; only a retreat may turn around.
    if (way === 1) return null;
  }
  return null;
}
