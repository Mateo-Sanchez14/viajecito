"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { sectionPath } from "@/features/trips/lib/paths";
import { useToday } from "../hooks/useToday";
export function TodayOverviewCard({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("today");
  const { data } = useToday(tripId);
  const summary =
    data?.mode === "before"
      ? data.countdown_days === 1
        ? t("countdownOne")
        : t("countdown", { days: data.countdown_days ?? 0 })
      : data?.mode === "after"
        ? t("after")
        : data?.mode === "undated"
          ? t("undated")
          : (data?.now_entry?.title ?? data?.next_entry?.title ?? t("empty"));
  return (
    <Link
      href={sectionPath(crewId, tripId, "today")}
      className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4"
    >
      <span className="font-medium">{t("title")}</span>
      <span className="text-sm text-muted">
        {data ? summary : t("loading")}
      </span>
    </Link>
  );
}
