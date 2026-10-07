import { daysUntil } from "@/shared/lib/daysUntil";

export type Countdown =
  | { kind: "undated" }
  | { kind: "upcoming"; days: number } // days >= 1; the copy treats 1 as "tomorrow"
  | { kind: "today" }
  | { kind: "ongoing"; day: number; total: number }
  | { kind: "done" };

/**
 * Where a trip stands relative to `now`, in the trip's time zone. Never yields a negative number:
 * once the start day has passed the trip is ongoing until its last day (inclusive), then done.
 * A trip with a start but no end is treated as a single day.
 */
export function tripCountdown(
  startOn: string | null,
  endOn: string | null,
  timeZone: string,
  now: Date,
): Countdown {
  if (!startOn) return { kind: "undated" };

  const untilStart = daysUntil(startOn, timeZone, now);
  if (untilStart > 0) return { kind: "upcoming", days: untilStart };
  if (untilStart === 0) return { kind: "today" };

  if (!endOn) return { kind: "done" };
  const untilEnd = daysUntil(endOn, timeZone, now);
  if (untilEnd < 0) return { kind: "done" };

  return { kind: "ongoing", day: 1 - untilStart, total: untilEnd - untilStart + 1 };
}
