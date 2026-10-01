"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import type { BestWindow } from "../api/dates";
import { useDayFormat } from "../lib/useDayFormat";
import { WindowBadge } from "./WindowBadge";

type BestWindowsPanelProps = {
  windows: BestWindow[];
  /** False while nobody has answered: the ranking would only be tie-breakers. */
  hasData: boolean;
  onClose: (window: BestWindow) => void;
  disabled?: boolean;
};

/** Presentational: the leading windows with their metrics and a close action each. */
export function BestWindowsPanel({ windows, hasData, onClose, disabled = false }: BestWindowsPanelProps) {
  const t = useTranslations("dates.best");
  const day = useDayFormat();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {!hasData || windows.length === 0 ? (
        <p className="text-sm text-muted">{t("noData")}</p>
      ) : (
        <ul aria-label={t("title")} className="flex flex-col gap-3">
          {windows.map((window) => {
            const range = `${day.short(window.start)} – ${day.short(window.end)}`;
            return (
              <li
                key={`${window.start}-${window.end}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {t("line", {
                      start: day.short(window.start),
                      end: day.short(window.end),
                      full: window.full_people.length,
                    })}
                  </p>
                  <WindowBadge blocked={window.blocked_people.length} />
                </div>
                <p className="text-sm text-muted">
                  {[
                    t("days", { count: window.days }),
                    t("weekend", { count: window.weekend_days }),
                    window.missing_people.length > 0 && t("missing", { count: window.missing_people.length }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Button disabled={disabled} onClick={() => onClose(window)}>
                  {t("close")}
                  <span className="sr-only"> {range}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
