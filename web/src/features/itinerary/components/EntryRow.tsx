"use client";
import { useTranslations } from "next-intl";
import type { Entry } from "../api/itinerary";
const icons: Record<Entry["kind"], string> = {
  activity: "◉",
  transport: "↗",
  lodging: "⌂",
  meal: "◇",
  meeting: "◎",
  ski: "△",
  other: "•",
};
export function EntryRow({
  entry,
  onMove,
  onEdit,
  onDelete,
  pending = false,
}: {
  entry: Entry;
  onMove: (direction: "up" | "down") => void;
  onEdit: () => void;
  onDelete: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("itinerary.entry");
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-muted">
            {entry.start_time ?? t("unscheduled")}
            {entry.end_time && ` – ${entry.end_time}`}
          </span>
          <h3 className="break-words font-medium">{entry.title}</h3>
          <span className="text-sm">
            <span aria-hidden>{icons[entry.kind]} </span>
            {t(`kind.${entry.kind}`)}
          </span>
          {entry.is_meeting_point && (
            <p className="text-sm font-medium">{t("meetingPoint")}</p>
          )}
          {entry.location_label && (
            <p className="break-words text-sm">{entry.location_label}</p>
          )}
          {entry.notes && (
            <p className="whitespace-pre-wrap break-words text-sm text-muted">
              {entry.notes}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded border border-border"
            aria-label={t("moveUp", { title: entry.title })}
            onClick={() => onMove("up")}
            disabled={pending}
          >
            ↑
          </button>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded border border-border"
            aria-label={t("moveDown", { title: entry.title })}
            onClick={() => onMove("down")}
            disabled={pending}
          >
            ↓
          </button>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded border border-border"
            aria-label={t("edit", { title: entry.title })}
            onClick={onEdit}
            disabled={pending}
          >
            ✎
          </button>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded border border-border"
            aria-label={t("delete", { title: entry.title })}
            onClick={onDelete}
            disabled={pending}
          >
            ×
          </button>
        </div>
      </div>
    </li>
  );
}
