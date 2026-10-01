import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/ui/atoms/Badge";
import { Card } from "@/ui/atoms/Card";
import type { SnowReport } from "../api/ski";

type SnowCardProps = {
  resortName: string;
  report: SnowReport | null;
  /** Slot under the numbers, e.g. the "report snow" button. */
  actions?: ReactNode;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Presentational: the latest snow report of one resort, with a text-and-icon stale flag. */
export function SnowCard({ resortName, report, actions }: SnowCardProps) {
  const t = useTranslations("ski");

  return (
    <Card as="article" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{resortName}</h3>
        {report?.stale && (
          <Badge variant="degraded">
            <span aria-hidden="true" className="mr-1">⚠</span>
            {t("conditions.stale", { hours: report.age_hours })}
          </Badge>
        )}
      </div>

      {report ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {report.base_cm !== null && (
              <Metric label={t("conditions.base")} value={t("units.cm", { value: report.base_cm })} />
            )}
            {report.new_24h_cm !== null && (
              <Metric label={t("conditions.new24h")} value={t("units.cm", { value: report.new_24h_cm })} />
            )}
            {report.forecast_72h_cm !== null && (
              <Metric label={t("conditions.forecast")} value={t("units.cm", { value: report.forecast_72h_cm })} />
            )}
            {report.temp_c !== null && (
              <Metric label={t("conditions.temp")} value={t("units.celsius", { value: report.temp_c })} />
            )}
            {report.lifts_open !== null && report.lifts_total !== null && (
              <Metric
                label={t("conditions.lifts")}
                value={t("conditions.openOfTotal", { open: report.lifts_open, total: report.lifts_total })}
              />
            )}
            {report.runs_open !== null && report.runs_total !== null && (
              <Metric
                label={t("conditions.runs")}
                value={t("conditions.openOfTotal", { open: report.runs_open, total: report.runs_total })}
              />
            )}
          </dl>
          {report.status_text && <p className="text-sm">{report.status_text}</p>}
          <p className="text-sm text-muted">
            {report.source === "open_meteo"
              ? t("conditions.source.open_meteo")
              : report.reporter
                ? t("conditions.source.manual", { name: report.reporter.display_name })
                : t("conditions.source.manualUnknown")}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{t("conditions.noData")}</p>
      )}
      {actions}
    </Card>
  );
}
