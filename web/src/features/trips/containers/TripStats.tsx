"use client";

import { useTranslations } from "next-intl";
import { tripStats, type TripStat } from "../stats";
import { useTripContext } from "../TripProvider";

/** Container: the readiness stat cards from the registry, gated by the trip's modules. */
export function TripStats({ stats = tripStats }: { stats?: TripStat[] }) {
  const t = useTranslations("trips.stats");
  const { trip, modules } = useTripContext();

  const entries = stats.filter((stat) => !stat.module || modules.includes(stat.module)).sort((a, b) => a.order - b.order);
  if (entries.length === 0) return null;

  return (
    <ul aria-label={t("label")} className="trip-stats ui-enter">
      {entries.map(({ key, Component }) => (
        <li key={key} className="empty:hidden">
          <Component tripId={trip.id} crewId={trip.crew_id} />
        </li>
      ))}
    </ul>
  );
}
