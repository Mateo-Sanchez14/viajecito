/** Pure calendar helpers over ISO days (`YYYY-MM-DD`). Everything runs in UTC so a day never shifts. */

export type Answer = "yes" | "maybe" | "no";
/** A cell value: an answer, or `null` for "not answered" (clears the day). */
export type CellValue = Answer | null;

export const WEEK_START_MONDAY = 1;

const CYCLE: readonly CellValue[] = [null, "yes", "maybe", "no"];

/** Tap order: empty, yes, maybe, no, then back to empty. */
export function nextAnswer(current: CellValue): CellValue {
  return CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
}

const MS_PER_DAY = 86_400_000;

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

export function isWeekend(iso: string): boolean {
  const day = new Date(toUtc(iso)).getUTCDay();
  return day === 0 || day === 6;
}

/** Monday = 0 .. Sunday = 6. */
function weekdayIndex(iso: string): number {
  return (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
}

/** Groups consecutive days into Monday-first weeks; days outside the range are `null`. */
export function weekRows(dates: string[]): (string | null)[][] {
  if (dates.length === 0) return [];
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = Array(weekdayIndex(dates[0])).fill(null);
  for (const date of dates) {
    row.push(date);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) rows.push([...row, ...Array(7 - row.length).fill(null)]);
  return rows;
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** The day an arrow key moves to; the same day when the target is outside `dates`. */
export function stepDate(dates: string[], from: string, key: string): string {
  const delta = STEP[key];
  if (delta === undefined) return from;
  const target = addDays(from, delta);
  return dates.includes(target) ? target : from;
}
