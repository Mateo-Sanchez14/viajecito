"use client";

import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { ANSWERS, ANSWER_CLASSES, ANSWER_GLYPH, answerKey } from "../lib/answers";
import { isWeekend, nextAnswer, stepDate, weekRows, addDays, type Answer, type CellValue } from "../lib/calendar";
import { useDayFormat } from "../lib/useDayFormat";

type AvailabilityGridProps = {
  /** Consecutive ISO days of the decision window. */
  dates: string[];
  /** My answers by ISO day; a missing day is unanswered. */
  answers: Record<string, Answer>;
  /** Called with the cells that change (`null` clears a day). */
  onChange: (changes: Record<string, CellValue>) => void;
  disabled?: boolean;
};

type Gesture = { origin: string; last: string; painting: boolean };

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
/** Monday 2024-01-01 seeds the weekday header; only its weekday matters. */
const HEADER_DAYS = Array.from({ length: 7 }, (_, i) => addDays("2024-01-01", i));

function dateOf(target: EventTarget | null): string | undefined {
  return (target as Element | null)?.closest?.("[data-date]")?.getAttribute("data-date") ?? undefined;
}

/**
 * My availability, one cell per day laid out in Monday-first weeks. Tap cycles a day
 * (empty, yes, maybe, no); dragging paints every crossed cell with the picked value (mouse
 * always, touch while "Pintar" is on, so the page still scrolls otherwise); the arrow keys
 * move, Space/Enter cycle, Shift+arrow extends the focused answer, Delete clears.
 */
export function AvailabilityGrid({ dates, answers, onChange, disabled = false }: AvailabilityGridProps) {
  const t = useTranslations("dates.grid");
  const day = useDayFormat();
  const gridRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [paintMode, setPaintMode] = useState(false);
  const [paint, setPaint] = useState<CellValue>("yes");
  const [focused, setFocused] = useState<string | null>(null);

  const rows = useMemo(() => weekRows(dates), [dates]);
  const tabStop = focused && dates.includes(focused) ? focused : dates[0];
  const valueOf = (date: string): CellValue => answers[date] ?? null;
  const answerLabel = (value: CellValue) => t(`legend.${answerKey(value)}`);

  function onPointerDown(event: PointerEvent) {
    const date = dateOf(event.target);
    if (disabled || !date) return;
    suppressClick.current = false;
    gesture.current = { origin: date, last: date, painting: paintMode };
    if (paintMode) {
      suppressClick.current = true;
      onChange({ [date]: paint });
    }
  }

  function onPointerMove(event: PointerEvent) {
    const current = gesture.current;
    if (disabled || !current) return;
    // Touch pointers are captured by the first cell, so the cell under the finger is looked up.
    const under = document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target;
    const date = dateOf(under);
    if (!date || date === current.last) return;
    if (!current.painting) {
      current.painting = true;
      suppressClick.current = true;
      onChange({ [current.origin]: paint });
    }
    current.last = date;
    onChange({ [date]: paint });
  }

  function endGesture() {
    gesture.current = null;
    // The click that follows a drag fires right after pointerup; forget the guard afterwards.
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }

  function onClick(event: MouseEvent) {
    const skip = suppressClick.current;
    suppressClick.current = false;
    const date = dateOf(event.target);
    if (disabled || skip || !date) return;
    onChange({ [date]: nextAnswer(valueOf(date)) });
  }

  function moveFocus(date: string) {
    setFocused(date);
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const date = dateOf(event.target);
    if (disabled || !date) return;
    if (ARROWS.includes(event.key)) {
      event.preventDefault();
      const target = stepDate(dates, date, event.key);
      if (target === date) return;
      if (event.shiftKey) onChange({ [target]: valueOf(date) });
      moveFocus(target);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onChange({ [date]: nextAnswer(valueOf(date)) });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onChange({ [date]: null });
    }
  }

  const options: { value: CellValue; key: "yes" | "maybe" | "no" | "clear" }[] = [
    ...ANSWERS.map((value) => ({ value, key: value })),
    { value: null, key: "clear" as const },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={paintMode}
          onClick={() => setPaintMode((on) => !on)}
          className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
            paintMode ? "border-foreground bg-foreground text-background" : "border-border bg-surface"
          }`}
        >
          {t("paint")}
        </button>
        <div role="group" aria-label={t("paintValue")} className="flex flex-wrap gap-2">
          {options.map(({ value, key }) => (
            <button
              key={key}
              type="button"
              aria-pressed={paint === value}
              onClick={() => setPaint(value)}
              className={`min-h-11 rounded-xl border px-3 text-sm ${
                paint === value ? "border-foreground font-medium" : "border-border"
              } ${value ? ANSWER_CLASSES[value] : "bg-surface"}`}
            >
              {value && <span aria-hidden="true">{ANSWER_GLYPH[value]} </span>}
              {t(`legend.${key}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted">{paintMode ? t("paintHint") : t("tapHint")}</p>

      <div
        ref={gridRef}
        role="grid"
        aria-label={t("label")}
        aria-readonly={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const date = dateOf(event.target);
          if (date) setFocused(date);
        }}
        className={`flex select-none flex-col gap-1 ${paintMode ? "touch-none" : "touch-manipulation"}`}
      >
        <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
          {HEADER_DAYS.map((iso) => (
            <div key={iso} role="columnheader">
              {day.weekday(iso)}
            </div>
          ))}
        </div>
        {rows.map((week, index) => (
          <div key={index} role="row" className="grid grid-cols-7 gap-1">
            {week.map((date, column) =>
              date ? (
                <GridCell
                  key={date}
                  date={date}
                  value={valueOf(date)}
                  tabStop={date === tabStop}
                  disabled={disabled}
                  label={t("cellLabel", { day: day.long(date), answer: answerLabel(valueOf(date)) })}
                  dayLabel={day.dayOfMonth(date)}
                  monthLabel={date.endsWith("-01") || date === dates[0] ? day.short(date).replace(/^\d+\s*/, "") : ""}
                />
              ) : (
                <div key={`gap-${column}`} role="gridcell" aria-hidden="true" />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type GridCellProps = {
  date: string;
  value: CellValue;
  tabStop: boolean;
  disabled: boolean;
  label: string;
  dayLabel: string;
  monthLabel: string;
};

function GridCell({ date, value, tabStop, disabled, label, dayLabel, monthLabel }: GridCellProps) {
  const weekend = isWeekend(date);
  const tone = value ? ANSWER_CLASSES[value] : weekend ? "bg-foreground/5 border-border" : "bg-surface border-border";
  return (
    <div
      role="gridcell"
      data-date={date}
      data-weekend={weekend}
      aria-label={label}
      tabIndex={tabStop ? 0 : -1}
      className={`flex min-h-11 w-full flex-col items-center justify-center rounded-lg border text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground ${tone} ${
        disabled ? "opacity-60" : "cursor-pointer"
      }`}
    >
      <span aria-hidden="true" className="text-xs leading-none opacity-70">
        {dayLabel}
        {monthLabel && <span className="ml-0.5">{monthLabel}</span>}
      </span>
      <span aria-hidden="true" className="text-base leading-tight">
        {value ? ANSWER_GLYPH[value] : " "}
      </span>
    </div>
  );
}
