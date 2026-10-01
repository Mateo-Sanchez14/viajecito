"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { EmptyState } from "@/ui/molecules/EmptyState";
import type { TripStatus } from "../api/trips";
import { useTrips } from "../hooks/useTrips";
import { useDateRange } from "../lib/useDateRange";
import { tripPath } from "../lib/paths";

const STATUS_VARIANT: Record<TripStatus, BadgeVariant> = {
  idea: "neutral",
  planning: "neutral",
  booked: "ok",
  ongoing: "ok",
  done: "neutral",
};

/** Container: the trips of one crew, each linking to its trip page. */
export function TripList({ crewId }: { crewId: string }) {
  const t = useTranslations("trips");
  const dateRange = useDateRange();
  const { data, isPending, isError } = useTrips(crewId);

  if (isPending) {
    return (
      <div role="status" aria-label={t("list.loading")} className="flex flex-col gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (isError) return <p className="text-sm text-warn">{t("list.error")}</p>;
  if (data.length === 0) return <EmptyState title={t("list.empty")} />;

  return (
    <ul className="flex flex-col gap-2">
      {data.map((trip) => (
        <li key={trip.id}>
          <Link
            href={tripPath(crewId, trip.id)}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-foreground/40"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{trip.name}</span>
              <span className="text-sm text-muted">{dateRange(trip.start_on, trip.end_on)}</span>
            </span>
            <Badge variant={STATUS_VARIANT[trip.status]}>{t(`status.${trip.status}`)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
