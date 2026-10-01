import { LogisticsOverviewCard } from "@/features/logistics/containers/LogisticsOverviewCard";
import { BudgetOverviewCard } from "@/features/budget/containers/BudgetOverviewCard";
import { DocumentsOverviewCard } from "@/features/documents/containers/DocumentsOverviewCard";
import { ProposalsOverviewCard } from "@/features/proposals/containers/ProposalsOverviewCard";
import { DatesOverviewCard } from "@/features/dates/containers/DatesOverviewCard";
import { SkiOverviewCard } from "@/features/ski/containers/SkiOverviewCard";
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
  { key: "logistics", module: "logistics", order: 30, Component: LogisticsOverviewCard },
  { key: "budget", module: "budget", order: 40, Component: BudgetOverviewCard },
  { key: "documents", module: "documents", order: 60, Component: DocumentsOverviewCard },

  { key: "proposals", module: "proposals", order: 10, Component: ProposalsOverviewCard },
  { key: "dates", module: "dates", order: 20, Component: DatesOverviewCard },
  { key: "ski", module: "ski", order: 15, Component: SkiOverviewCard },
  { key: "pwa-countdown", order: 1, Component: CountdownCard },
  { key: "pwa-install", order: 2, Component: InstallCard },
  { key: "push-opt-in", order: 3, Component: PushOptInCard },
  { key: "pwa-offline-documents", module: "documents", order: 61, Component: OfflineDocumentsCard },
];
