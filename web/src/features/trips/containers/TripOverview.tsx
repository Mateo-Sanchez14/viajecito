"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/ui/atoms/Avatar";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import type { Rsvp } from "../api/trips";
import { tripCards, type TripCard } from "../cards";
import { sectionPath } from "../lib/paths";
import { useSectionLabel } from "../lib/useSectionLabel";
import { useTripContext } from "../TripProvider";
import { tripStats, type TripStat } from "../stats";
import { RsvpControl } from "./RsvpControl";
import { TripHero } from "./TripHero";
import { TripStats } from "./TripStats";

const RSVP_VARIANT: Record<Rsvp, BadgeVariant> = {
  in: "ok",
  maybe: "degraded",
  out: "neutral",
  pending: "neutral",
};

/** Container: hero, readiness stats, who is going (with my RSVP) and a card per module. */
export function TripOverview({
  cards = tripCards,
  stats = tripStats,
}: {
  cards?: TripCard[];
  stats?: TripStat[];
}) {
  const t = useTranslations("trips");
  const sectionLabel = useSectionLabel();
  const { trip, modules, participants } = useTripContext();

  const visible = cards.filter((card) => !card.module || modules.includes(card.module));
  const covered = new Set(visible.map((card) => card.module));
  const placeholders = modules.filter((key) => !covered.has(key));
  const entries = [...visible].sort((a, b) => a.order - b.order);

  return (
    <div className="trip-overview">
      <TripHero />
      <TripStats stats={stats} />

      <section id="rsvp" aria-labelledby="overview-crew-title" className="overview-crew flex min-w-0 flex-col gap-4">
        <h2 id="overview-crew-title" className="text-lg font-semibold">
          {t("overview.participants")}
        </h2>
        <RsvpControl />
        {participants.length === 0 ? (
          <p className="text-sm text-muted">{t("overview.noParticipants")}</p>
        ) : (
          <ul aria-label={t("overview.participants")} className="overview-crew-list flex flex-col gap-2">
            {participants.map((p) => (
              <li
                key={p.person_id}
                className="participant-row flex items-center justify-between gap-3 border-b border-border px-1 py-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={p.display_name} />
                  <span className="break-words font-medium">{p.display_name}</span>
                </span>
                <Badge variant={RSVP_VARIANT[p.rsvp]}>{t(`rsvp.${p.rsvp}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entries.length + placeholders.length > 0 && (
        <section className="overview-modules flex min-w-0 flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("overview.modules")}</h2>
          <ul aria-label={t("overview.modules")} className="overview-module-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
            {entries.map(({ key, Component }) => (
              <li key={key} className="empty:hidden">
                <Component tripId={trip.id} crewId={trip.crew_id} />
              </li>
            ))}
            {placeholders.map((key) => (
              <li key={`placeholder-${key}`}>
                <Link
                  href={sectionPath(trip.crew_id, trip.id, key)}
                  className="flex h-full items-center rounded-xl border border-border bg-surface px-4 py-4 font-medium hover:border-foreground/40"
                >
                  {sectionLabel(key)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
