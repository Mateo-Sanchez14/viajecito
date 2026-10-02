"use client";
import { useTranslations } from "next-intl";
import type { Entry } from "@/features/itinerary/api/itinerary";
export function TimelineItem({
  entry,
  highlight,
}: {
  entry: Entry;
  highlight?: "now" | "next";
}) {
  const t = useTranslations("today");
  return (
    <li
      className={`rounded-xl border p-4 ${highlight === "now" ? "border-foreground bg-surface" : "border-border"}`}
    >
      {highlight && (
        <span className="text-sm font-semibold">{t(highlight)}</span>
      )}
      <div className="flex flex-wrap gap-3">
        <time className="font-medium">{entry.start_time ?? "—"}</time>
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold">{entry.title}</h3>
          {entry.location_label && (
            <p className="break-words text-sm">{entry.location_label}</p>
          )}
          {entry.notes && (
            <p className="whitespace-pre-wrap break-words text-sm text-muted">
              {entry.notes}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
