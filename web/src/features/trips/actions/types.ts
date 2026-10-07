import type { ComponentType } from "react";

/**
 * A "what's missing" rule on the trip overview. `module` ties it to a trip module (it only renders
 * when the trip has that module); a rule without `module` always renders. Lower `order` first.
 * Its component renders one row, or nothing when the rule does not apply (or its data is not in).
 */
export type TripAction = {
  key: string;
  module?: string;
  order: number;
  Component: ComponentType<{ tripId: string; crewId: string }>;
};

export type ActionTone = "accent" | "warn" | "neutral";

/** Where a row leads: the RSVP block on the overview, or a trip section. */
export type ActionTarget = "rsvp" | "dates" | "budget" | "logistics" | "documents" | "itinerary";

/**
 * What a rule decided to say. `messageKey` is a key under `trips.actions` (the optional detail line
 * is `<messageKey>Detail`); `values` fill its ICU plurals. Pure data: components turn it into a row.
 */
export type ActionItem = {
  messageKey: string;
  values?: Record<string, string | number>;
  target: ActionTarget;
  tone: ActionTone;
};
