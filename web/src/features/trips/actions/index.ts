import { DatesAction } from "./DatesAction";
import { DocumentsNoneAction } from "./DocumentsNoneAction";
import { ItineraryEmptyAction } from "./ItineraryEmptyAction";
import { MissingPriceAction } from "./MissingPriceAction";
import { RsvpMineAction } from "./RsvpMineAction";
import { RsvpOthersAction } from "./RsvpOthersAction";
import { TasksMineAction } from "./TasksMineAction";
import { TasksOverdueAction } from "./TasksOverdueAction";
import type { TripAction } from "./types";

export type { TripAction } from "./types";

/**
 * Append-only registry of the overview's "what's missing" rules, shaped like the overview cards:
 * one import plus one entry per rule, no other file to edit. Each rule reads queries the module
 * cards already use, and renders one row or nothing.
 */
export const tripActions: TripAction[] = [
  { key: "rsvp-mine", order: 1, Component: RsvpMineAction },
  { key: "rsvp-others", order: 5, Component: RsvpOthersAction },
  { key: "dates", module: "dates", order: 10, Component: DatesAction },
  { key: "missing-price", module: "budget", order: 20, Component: MissingPriceAction },
  { key: "tasks-overdue", module: "logistics", order: 30, Component: TasksOverdueAction },
  { key: "tasks-mine", module: "logistics", order: 31, Component: TasksMineAction },
  { key: "documents-none", module: "documents", order: 40, Component: DocumentsNoneAction },
  { key: "itinerary-empty", module: "itinerary", order: 50, Component: ItineraryEmptyAction },
];
