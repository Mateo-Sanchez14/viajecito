"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMapProposals } from "../hooks/useMapProposals";
import { mapPlaces } from "../lib/places";
export function MapOverviewCard({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("map");
  const { data } = useMapProposals(tripId);
  return (
    <Link
      href={`/crews/${encodeURIComponent(crewId)}/trips/${encodeURIComponent(tripId)}/map`}
      className="group flex h-full min-h-11 flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
    >
      <span className="flex items-center justify-between gap-3 font-medium">
        <span>{t("open")}</span>
        <span aria-hidden className="text-xl">
          ↗
        </span>
      </span>
      <span className="text-sm text-muted">
        {data ? t("located", { n: mapPlaces(data).length }) : t("loading")}
      </span>
    </Link>
  );
}
