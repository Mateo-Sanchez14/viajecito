"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/ui/atoms/Avatar";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import { Card } from "@/ui/atoms/Card";
import type { Rsvp } from "../api/trips";
import { tripCards, type TripCard } from "../cards";
import { sectionPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";
import { useSectionLabel } from "../lib/useSectionLabel";
import { useTripContext } from "../TripProvider";
import { RsvpControl } from "./RsvpControl";

const RSVP_VARIANT: Record<Rsvp, BadgeVariant> = {
  in: "ok",
  maybe: "degraded",
  out: "neutral",
  pending: "neutral",
};

/** Container: trip summary, my RSVP, who is going and a card per module. */
export function TripOverview({ cards = tripCards }: { cards?: TripCard[] }) {
  const t = useTranslations("trips");
  const dateRange = useDateRange();
  const sectionLabel = useSectionLabel();
  const { trip, modules, participants } = useTripContext();

  const visible = cards.filter((card) => !card.module || modules.includes(card.module));
  const covered = new Set(visible.map((card) => card.module));
  const placeholders = modules.filter((key) => !covered.has(key));
  const entries = [...visible].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">{t("overview.dates")}</dt>
            <dd className="font-medium">{dateRange(trip.start_on, trip.end_on)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t("overview.destination")}</dt>
            <dd className="font-medium">{trip.destination_label || t("overview.noDestination")}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t("overview.currency")}</dt>
            <dd className="font-medium">{trip.currency}</dd>
          </div>
        </dl>
        <RsvpControl />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("overview.participants")}</h2>
        {participants.length === 0 ? (
          <p className="text-sm text-muted">{t("overview.noParticipants")}</p>
        ) : (
          <ul aria-label={t("overview.participants")} className="flex flex-col gap-2">
            {participants.map((p) => (
              <li
                key={p.person_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2"
              >
                <span className="flex items-center gap-3">
                  <Avatar name={p.display_name} />
                  <span className="font-medium">{p.display_name}</span>
                </span>
                <Badge variant={RSVP_VARIANT[p.rsvp]}>{t(`rsvp.${p.rsvp}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("overview.modules")}</h2>
        <ul aria-label={t("overview.modules")} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    </div>
  );
}
