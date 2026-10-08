/**
 * Stable `data-tour` values: the contract between the pages that carry an anchor and the onboarding
 * tour that points at it. Lives in `shared` so a feature can mark an element without importing the
 * tour. The attribute never changes an element's role, name or layout.
 */
export const TOUR_ANCHOR = {
  nav: "nav",
  cover: "cover",
  nextActions: "next-actions",
  rsvp: "rsvp",
  capture: "capture",
} as const;

export type TourAnchor = (typeof TOUR_ANCHOR)[keyof typeof TOUR_ANCHOR];
