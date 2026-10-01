"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { GridPerson } from "../api/dates";
import { ANSWERS } from "../lib/answers";
import { weekRows } from "../lib/calendar";
import { useDayFormat } from "../lib/useDayFormat";

type CrewHeatmapProps = {
  dates: string[];
  /** Everybody except me. */
  people: GridPerson[];
};

/** Presentational: per day, how many people said yes / maybe; tap a day to see names. */
export function CrewHeatmap({ dates, people }: CrewHeatmapProps) {
  const t = useTranslations("dates.heatmap");
  const day = useDayFormat();
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => weekRows(dates), [dates]);
  const total = Math.max(people.length, 1);

  const count = (date: string, answer: string) => people.filter((p) => p.answers[date] === answer).length;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <div className="flex flex-col gap-1">
        {rows.map((week, index) => (
          <div key={index} className="grid grid-cols-7 gap-1">
            {week.map((date, column) => {
              if (!date) return <div key={`gap-${column}`} aria-hidden="true" />;
              const yes = count(date, "yes");
              const maybe = count(date, "maybe");
              return (
                <button
                  key={date}
                  type="button"
                  aria-expanded={selected === date}
                  aria-label={t("cellLabel", { day: day.long(date), yes, maybe })}
                  onClick={() => setSelected((current) => (current === date ? null : date))}
                  style={{ backgroundColor: `color-mix(in srgb, var(--ok) ${Math.round((yes / total) * 60)}%, transparent)` }}
                  className="flex min-h-11 w-full flex-col items-center justify-center rounded-lg border border-border text-sm"
                >
                  <span aria-hidden="true" className="text-xs opacity-70">{day.dayOfMonth(date)}</span>
                  <span aria-hidden="true" className="font-medium leading-tight">
                    {yes}
                    {maybe > 0 && <span className="text-xs text-warn">+{maybe}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {selected && (
        <div
          role="region"
          aria-label={t("detailTitle", { day: day.long(selected) })}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm"
        >
          {ANSWERS.map((answer) => {
            const names = people.filter((p) => p.answers[selected] === answer).map((p) => p.display_name);
            return names.length > 0 ? (
              <p key={answer}>
                <span className="font-medium">{t(answer)}:</span> {names.join(", ")}
              </p>
            ) : null;
          })}
          {people.every((p) => !p.answers[selected]) && <p className="text-muted">{t("nobody")}</p>}
        </div>
      )}
    </section>
  );
}
