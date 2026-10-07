"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { CalendarBlankIcon, CaretRightIcon } from "@/ui/icons";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { InlineError } from "@/ui/molecules/InlineError";
import { coverPath } from "../api/cover";
import type { TripStatus, TripSummary } from "../api/trips";
import { useTrips } from "../hooks/useTrips";
import { coverScene } from "../lib/coverScene";
import { useDateRange } from "../lib/useDateRange";
import { tripPath } from "../lib/paths";

const STATUS_VARIANT: Record<TripStatus, BadgeVariant> = {
  idea: "neutral",
  planning: "neutral",
  booked: "ok",
  ongoing: "ok",
  done: "neutral",
};

/** The ticket picture: the cover when there is one and it loads, the trip's illustration otherwise. */
function TicketMedia({ trip }: { trip: TripSummary }) {
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const showPhoto = trip.has_cover && failedVersion !== trip.cover_version;
  return (
    <span className="trip-ticket-media" aria-hidden="true">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authorized endpoint: next/image cannot forward the session
        <img
          src={coverPath(trip)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedVersion(trip.cover_version)}
        />
      ) : (
        <TripCoverArt scene={coverScene(trip)} />
      )}
    </span>
  );
}

/** Container: the trips of one crew, each linking to its trip page. */
export function TripList({ crewId }: { crewId: string }) {
  const t = useTranslations("trips");
  const ui = useTranslations("ui");
  const dateRange = useDateRange();
  const { data, isPending, isError, refetch } = useTrips(crewId);

  if (isPending) {
    return (
      <div role="status" aria-label={t("list.loading")} className="trip-list flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (isError) {
    return <InlineError message={t("list.error")} retryLabel={ui("retry")} onRetry={() => void refetch()} />;
  }
  if (data.length === 0) return <EmptyState art={<EmptyArt scene="map" />} title={t("list.empty")} />;

  return (
    <ul className="trip-list flex flex-col gap-3">
      {data.map((trip) => (
        <li key={trip.id}>
          <Link href={tripPath(crewId, trip.id)} className="trip-ticket border border-border bg-surface">
            <span className="trip-ticket-main">
              <TicketMedia trip={trip} />
              <span className="trip-ticket-text">
                <span className="trip-ticket-title font-semibold">{trip.name}</span>
                <span className="trip-ticket-dates text-sm text-muted">
                  <CalendarBlankIcon size={16} aria-hidden="true" />
                  {dateRange(trip.start_on, trip.end_on)}
                </span>
              </span>
            </span>
            <span className="trip-ticket-stub">
              <Badge variant={STATUS_VARIANT[trip.status]}>{t(`status.${trip.status}`)}</Badge>
              <CaretRightIcon size={18} aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
