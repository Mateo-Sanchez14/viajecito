import { useFormatter, useTranslations } from "next-intl";

/**
 * Returns a formatter turning a trip's ISO days into copy ("1 jul 2027 al 8 jul 2027",
 * "Desde el …", or "no dates yet"). Days are formatted in UTC so they never shift a day.
 */
export function useDateRange() {
  const t = useTranslations("trips");
  const format = useFormatter();
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      dateStyle: "medium",
      timeZone: "UTC",
    });

  return (start: string | null | undefined, end: string | null | undefined): string => {
    if (start && end) return t("dateRange", { start: day(start), end: day(end) });
    if (start) return t("dateFrom", { start: day(start) });
    if (end) return t("dateUntil", { end: day(end) });
    return t("noDates");
  };
}
