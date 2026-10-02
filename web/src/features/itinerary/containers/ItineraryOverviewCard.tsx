"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { sectionPath } from "@/features/trips/lib/paths";
import { useItinerary } from "../hooks/queries";
export function ItineraryOverviewCard({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("itinerary");
  const { data } = useItinerary(tripId);
  return (
    <Link
      href={sectionPath(crewId, tripId, "itinerary")}
      className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4"
    >
      <span className="font-medium">{t("title")}</span>
      <span className="text-sm text-muted">
        {data ? t("overview", { n: data.tray.length }) : t("loading")}
      </span>
    </Link>
  );
}
