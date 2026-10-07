import { PackingStat } from "./PackingStat";
import { PeopleStat } from "./PeopleStat";
import { ProposalsStat } from "./ProposalsStat";
import { TasksStat } from "./TasksStat";
import type { TripStat } from "./types";

export type { TripStat } from "./types";

/**
 * Append-only registry of the readiness stats under the hero, shaped like the overview cards:
 * one import plus one entry per stat. Stats read queries the module cards already use.
 */
export const tripStats: TripStat[] = [
  { key: "people", order: 10, Component: PeopleStat },
  { key: "proposals", module: "proposals", order: 20, Component: ProposalsStat },
  { key: "tasks", module: "logistics", order: 30, Component: TasksStat },
  { key: "packing", module: "logistics", order: 40, Component: PackingStat },
];
