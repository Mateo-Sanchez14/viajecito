import { InstallCard } from "@/features/pwa/containers/InstallCard";
import { CountdownCard } from "@/features/pwa/containers/CountdownCard";
import { OfflineDocumentsCard } from "@/features/pwa/containers/OfflineDocumentsCard";
import { PushOptInCard } from "@/features/push/containers/PushOptInCard";
import type { TripCard } from "./types";

export type { TripCard } from "./types";

/**
 * Append-only registry of overview cards: one import plus one entry per milestone card, e.g.
 *   import { ProposalsOverviewCard } from "@/features/proposals/containers/ProposalsOverviewCard";
 *   { key: "proposals", module: "proposals", order: 10, Component: ProposalsOverviewCard },
 * Modules enabled on a trip without an entry here get a core placeholder card.
 */
export const tripCards: TripCard[] = [
  { key: "pwa-countdown", order: 1, Component: CountdownCard },
  { key: "pwa-install", order: 2, Component: InstallCard },
  { key: "push-opt-in", order: 3, Component: PushOptInCard },
  { key: "pwa-offline-documents", module: "documents", order: 61, Component: OfflineDocumentsCard },
];
