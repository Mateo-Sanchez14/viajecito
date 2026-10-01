"use client";
import { useTranslations } from "next-intl";
import type { Today } from "@/features/itinerary/api/itinerary";
import { TimelineItem } from "../components/TimelineItem";
export function TodayTimeline({ today }: { today: Today }) {
  const t = useTranslations("today");
  return today.day?.entries.length ? (
    <ol aria-label={t("timeline")} className="space-y-3">
      {today.day.entries.map((entry) => (
        <TimelineItem
          key={entry.id}
          entry={entry}
          highlight={
            today.now_entry?.id === entry.id
              ? "now"
              : today.next_entry?.id === entry.id
                ? "next"
                : undefined
          }
        />
      ))}
    </ol>
  ) : (
    <p>{t("empty")}</p>
  );
}
