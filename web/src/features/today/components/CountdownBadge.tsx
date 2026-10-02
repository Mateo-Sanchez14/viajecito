"use client";
import { useTranslations } from "next-intl";
export function CountdownBadge({ days }: { days: number }) {
  const t = useTranslations("today");
  return (
    <p className="text-2xl font-semibold">
      {days === 1 ? t("countdownOne") : t("countdown", { days })}
    </p>
  );
}
