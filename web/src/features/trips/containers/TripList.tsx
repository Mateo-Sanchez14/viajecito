"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/ui/atoms/Skeleton";
import type { BadgeVariant } from "@/ui/atoms/Badge";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { InlineError } from "@/ui/molecules/InlineError";
import { TripCard } from "@/ui/organisms/TripCard";
import { TripSection } from "@/ui/organisms/TripSection";
import { useClientNow } from "@/shared/lib/useClientNow";
import type { TripStatus, TripSummary } from "../api/trips";
import { useTrips } from "../hooks/useTrips";
import { tripPath } from "../lib/paths";
import { groupTrips, type SectionEntry } from "../lib/tripSections";
import { useDateRange } from "../lib/useDateRange";
import { useTripPill } from "../lib/useTripPill";
import { TripCardMedia } from "./TripCardMedia";

const STATUS_VARIANT: Record<TripStatus, BadgeVariant> = {
  idea: "neutral",
  planning: "neutral",
  booked: "ok",
  ongoing: "ok",
  done: "neutral",
};

/** How many avatars a card draws; the rest of the group becomes "+N". */
const MAX_FACES = 4;

type TripListProps = {
  crewId: string;
  /** Heading level of the group titles (3 under a lone "Mis viajes", 4 under a crew heading). */
  level?: 3 | 4;
  /** The trip the hero already features: it is not repeated below. */
  featuredTripId?: string;
};

/** Container: one crew's trips grouped as upcoming, undated and past cards, each linking to its page. */
export function TripList({ crewId, level = 3, featuredTripId }: TripListProps) {
  const t = useTranslations("trips");
  const ui = useTranslations("ui");
  const dateRange = useDateRange();
  const pillFor = useTripPill();
  const now = useClientNow();
  const { data, isPending, isError, refetch } = useTrips(crewId);

  if (isPending) {
    return (
      <div key="loading" role="status" aria-label={t("list.loading")} className="trip-list-loading">
        <Skeleton className="trip-card-skeleton" />
        <Skeleton className="trip-card-skeleton" />
      </div>
    );
  }
  if (isError) {
    return <InlineError message={t("list.error")} retryLabel={ui("retry")} onRetry={() => void refetch()} />;
  }
  if (data.length === 0) return <EmptyState art={<EmptyArt scene="map" />} title={t("list.empty")} />;

  const visible = data.filter((trip) => trip.id !== featuredTripId);
  if (visible.length === 0) return <p className="trip-list-note text-sm text-muted">{t("list.onlyFeatured")}</p>;

  const sections = groupTrips(visible, now, Intl.DateTimeFormat().resolvedOptions().timeZone);
  // One entrance sequence across the groups: each card starts after the ones above it.
  const offsets = {
    upcoming: 0,
    undated: sections.upcoming.length,
    past: sections.upcoming.length + sections.undated.length,
  };
  const card = ({ trip, countdown }: SectionEntry, index: number, variant: "card" | "compact") => (
    <li key={trip.id}>
      <TripCard
        index={index}
        variant={variant}
        href={tripPath(crewId, trip.id)}
        name={trip.name}
        destination={trip.destination_label || undefined}
        dates={dateRange(trip.start_on, trip.end_on)}
        media={<TripCardMedia trip={trip} />}
        pill={pillFor(countdown)}
        status={{ label: t(`status.${trip.status}`), variant: STATUS_VARIANT[trip.status] }}
        people={peopleOf(trip, t("card.people", { count: trip.member_count }))}
      />
    </li>
  );

  return (
    <div key="groups" className="trip-groups">
      {sections.upcoming.length > 0 && (
        <TripSection title={t("sections.upcoming")} level={level} layout="rail">
          {sections.upcoming.map((entry, i) => card(entry, offsets.upcoming + i, "card"))}
        </TripSection>
      )}
      {sections.undated.length > 0 && (
        <TripSection title={t("sections.undated")} level={level} layout="rail">
          {sections.undated.map((entry, i) => card(entry, offsets.undated + i, "card"))}
        </TripSection>
      )}
      {sections.past.length > 0 && (
        <TripSection title={t("sections.past")} level={level} layout="list" muted>
          {sections.past.map((entry, i) => card(entry, offsets.past + i, "compact"))}
        </TripSection>
      )}
    </div>
  );
}

function peopleOf(trip: TripSummary, label: string) {
  if (trip.member_count === 0) return undefined;
  return {
    names: trip.members_preview.slice(0, MAX_FACES).map((member) => member.display_name),
    total: trip.member_count,
    label,
  };
}
