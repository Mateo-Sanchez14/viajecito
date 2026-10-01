import { useFormatter } from "next-intl";

/** Day formatters for ISO days; always UTC so a day never shifts with the viewer's timezone. */
export function useDayFormat() {
  const format = useFormatter();
  const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const short = (iso: string) => format.dateTime(utc(iso), { day: "numeric", month: "short", timeZone: "UTC" });
  const dayOfMonth = (iso: string) => format.dateTime(utc(iso), { day: "numeric", timeZone: "UTC" });
  return {
    /** "10 jul" */
    short,
    /** "sáb, 10 de julio" */
    long: (iso: string) =>
      format.dateTime(utc(iso), { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }),
    /** "sáb" */
    weekday: (iso: string) => format.dateTime(utc(iso), { weekday: "short", timeZone: "UTC" }),
    /** "10" */
    dayOfMonth,
    /** "12–19 jul" inside one month, "28 jul–4 ago" across months. */
    range: (start: string, end: string) =>
      start.slice(0, 7) === end.slice(0, 7) ? `${dayOfMonth(start)}–${short(end)}` : `${short(start)}–${short(end)}`,
    /** An instant (the deadline) in the viewer's own timezone: "10 jul, 15:30". */
    dateTime: (instant: string) =>
      format.dateTime(new Date(instant), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  };
}
