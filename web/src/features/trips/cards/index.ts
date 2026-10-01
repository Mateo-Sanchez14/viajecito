import { ProposalsOverviewCard } from "@/features/proposals/containers/ProposalsOverviewCard";
import type { TripCard } from "./types";

export type { TripCard } from "./types";

/**
 * Append-only registry of overview cards: one import plus one entry per milestone card, e.g.
 *   import { ProposalsOverviewCard } from "@/features/proposals/containers/ProposalsOverviewCard";
 *   { key: "proposals", module: "proposals", order: 10, Component: ProposalsOverviewCard },
 * Modules enabled on a trip without an entry here get a core placeholder card.
 */
export const tripCards: TripCard[] = [
  { key: "proposals", module: "proposals", order: 10, Component: ProposalsOverviewCard },
];
