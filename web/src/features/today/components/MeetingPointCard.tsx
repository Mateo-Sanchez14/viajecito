"use client";
import { useTranslations } from "next-intl";
import type { Entry } from "@/features/itinerary/api/itinerary";
export function MeetingPointCard({ entry }: { entry: Entry }) {
  const t = useTranslations("today");
  const map =
    entry.lat != null &&
    entry.lng != null &&
    Number.isFinite(entry.lat) &&
    Number.isFinite(entry.lng)
      ? `https://www.openstreetmap.org/?mlat=${entry.lat}&mlon=${entry.lng}`
      : null;
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">{t("meetingPoint")}</h2>
      <p className="break-words text-2xl font-semibold">{entry.title}</p>
      {entry.start_time && (
        <p className="text-xl">
          {entry.day_date} · {entry.start_time}
        </p>
      )}
      {entry.location_label && (
        <p className="break-words">{entry.location_label}</p>
      )}
      {map && (
        <a
          href={map}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline"
        >
          {t("map")}
        </a>
      )}
    </section>
  );
}
