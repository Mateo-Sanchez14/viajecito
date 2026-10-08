import { TOUR_ANCHOR, type TourAnchor } from "@/shared/lib/tourAnchors";

export type TourStepId = "nav" | "cover" | "nextActions" | "rsvp" | "capture";

export type TourStep = { id: TourStepId; anchor: TourAnchor };

/** In page order, so the tour scrolls as little as possible; it ends on the "+" call to action. */
export const TOUR_STEPS: readonly TourStep[] = [
  { id: "nav", anchor: TOUR_ANCHOR.nav },
  { id: "cover", anchor: TOUR_ANCHOR.cover },
  { id: "nextActions", anchor: TOUR_ANCHOR.nextActions },
  { id: "rsvp", anchor: TOUR_ANCHOR.rsvp },
  { id: "capture", anchor: TOUR_ANCHOR.capture },
];
