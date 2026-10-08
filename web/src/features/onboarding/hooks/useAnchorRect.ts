"use client";

import { useEffect, useState } from "react";
import type { TourAnchor } from "@/shared/lib/tourAnchors";
import { findAnchor } from "../lib/anchors";
import type { Rect } from "../lib/placement";

export type AnchorState = {
  /** The visible element carrying the anchor, or null when there is none (right now). */
  element: HTMLElement | null;
  rect: Rect | null;
  /** False until the first measurement: "not looked yet" is not "gone". */
  measured: boolean;
};

type Internal = AnchorState & { anchor: TourAnchor | null };

const UNMEASURED: Internal = { anchor: null, element: null, rect: null, measured: false };

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

function measure(anchor: TourAnchor): Internal {
  const element = findAnchor(anchor);
  if (!element) return { anchor, element: null, rect: null, measured: true };
  const { x, y, width, height } = element.getBoundingClientRect();
  return { anchor, element, rect: { x, y, width, height }, measured: true };
}

/**
 * Where an anchor is on screen, kept current while the window resizes, anything scrolls or the
 * element itself changes size. Updates are throttled to one per frame. The anchor is looked up again
 * on every measurement, so a navigation that swaps for the other (SectionNav <-> BottomNav) is followed.
 */
export function useAnchorRect(anchor: TourAnchor | null): AnchorState {
  const [state, setState] = useState<Internal>(UNMEASURED);

  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    let observed: HTMLElement | null = null;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;

    function update() {
      frame = 0;
      const next = measure(anchor as TourAnchor);
      if (next.element !== observed) {
        if (observed) observer?.unobserve(observed);
        if (next.element) observer?.observe(next.element);
        observed = next.element;
      }
      setState((current) =>
        current.anchor === next.anchor && current.element === next.element && sameRect(current.rect, next.rect)
          ? current
          : next,
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("resize", schedule);
    // Capture: scroll does not bubble, and the page, a nav strip or a sheet may be what moves.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchor]);

  // The rect of the previous anchor is kept until the new one is measured, so the ring glides instead of jumping.
  const fresh = anchor !== null && state.anchor === anchor;
  return { element: fresh ? state.element : null, measured: fresh && state.measured, rect: state.rect };
}
