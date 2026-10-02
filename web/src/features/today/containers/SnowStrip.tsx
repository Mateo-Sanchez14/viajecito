"use client";
import { useTranslations } from "next-intl";
import { useSkiConditions } from "../hooks/external";
export function SnowStrip({ tripId }: { tripId: string }) {
  const t = useTranslations("today.snow");
  const { data, isError } = useSkiConditions(tripId);
  return (
    <section className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {isError && <p role="status">{t("error")}</p>}
      {data &&
        (!data.resorts.length ||
          data.resorts.every((r) => !r.latest_report)) && <p>{t("empty")}</p>}
      {data?.resorts.map((resort) => (
        <div key={resort.resort_id}>
          <h3 className="font-medium">{resort.name}</h3>
          {resort.latest_report && (
            <>
              <p>
                {resort.latest_report.base_cm != null &&
                  t("base", { cm: resort.latest_report.base_cm })}{" "}
                ·{" "}
                {resort.latest_report.new_24h_cm != null &&
                  t("new", { cm: resort.latest_report.new_24h_cm })}
              </p>
              {resort.latest_report.stale && (
                <p className="text-sm text-muted">
                  {t("stale", {
                    hours: Math.floor(resort.latest_report.age_hours),
                  })}
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
