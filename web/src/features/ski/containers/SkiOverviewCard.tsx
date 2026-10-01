"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sectionPath } from "@/features/trips/lib/paths";
import { Badge } from "@/ui/atoms/Badge";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { useSkiOverview } from "../hooks/queries";

/** Overview card of the ski module: first resort's base and new snow, and who lacks a pass. */
export function SkiOverviewCard({ tripId, crewId }: { tripId: string; crewId: string }) {
  const t = useTranslations("ski");
  const { data: overview, isPending } = useSkiOverview(tripId);
  const first = overview?.resorts[0];
  const report = first?.latest_report ?? null;
  const missing = overview?.passes.missing.length ?? 0;
  const cm = (value: number | null) => (value === null ? "—" : t("units.cm", { value }));

  return (
    <Link
      href={sectionPath(crewId, tripId, "ski")}
      className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-4 hover:border-foreground/40"
    >
      <span className="font-medium">{t("title")}</span>
      {isPending && <Skeleton className="h-10" />}
      {overview && !first && <span className="text-sm text-muted">{t("empty.resorts")}</span>}
      {first && (
        <>
          <span className="text-sm font-medium">{first.resort.name}</span>
          {report ? (
            <span className="text-sm">
              {t("card.summary", { base: cm(report.base_cm), fresh: cm(report.new_24h_cm) })}
            </span>
          ) : (
            <span className="text-sm text-muted">{t("card.noReport")}</span>
          )}
          {report?.stale && (
            <Badge variant="degraded">
              <span aria-hidden="true" className="mr-1">⚠</span>
              {t("conditions.stale", { hours: report.age_hours })}
            </Badge>
          )}
        </>
      )}
      {missing > 0 && <Badge variant="degraded">{t("passes.missing", { n: missing })}</Badge>}
    </Link>
  );
}
