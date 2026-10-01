import { useFormatter } from "next-intl";

/** Day formatters for ISO days; always UTC so a day never shifts with the viewer's timezone. */
export function useDayFormat() {
  const format = useFormatter();
  const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
  return {
    /** "10 jul" */
    short: (iso: string) => format.dateTime(utc(iso), { day: "numeric", month: "short", timeZone: "UTC" }),
    /** "sáb, 10 de julio" */
    long: (iso: string) =>
      format.dateTime(utc(iso), { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }),
    /** "sáb" */
    weekday: (iso: string) => format.dateTime(utc(iso), { weekday: "short", timeZone: "UTC" }),
    /** "10" */
    dayOfMonth: (iso: string) => format.dateTime(utc(iso), { day: "numeric", timeZone: "UTC" }),
    /** An instant (the deadline) in the viewer's own timezone: "10 jul, 15:30". */
    dateTime: (instant: string) =>
      format.dateTime(new Date(instant), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  };
}
