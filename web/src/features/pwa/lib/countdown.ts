const MS_PER_DAY = 86_400_000;

/** The calendar day (YYYY-MM-DD) of `now` in `timeZone`. */
function localDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const toUtcDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Whole calendar days from today (in the trip time zone) until `startOn`; negative once started. */
export function daysUntil(startOn: string, timeZone: string, now: Date): number {
  return Math.round((toUtcDay(startOn) - toUtcDay(localDay(now, timeZone))) / MS_PER_DAY);
}
