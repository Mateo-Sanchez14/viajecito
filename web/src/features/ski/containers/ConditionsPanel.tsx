"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { EmptyState } from "@/ui/molecules/EmptyState";
import type { TripResort } from "../api/ski";
import { ManualReportForm } from "../components/ManualReportForm";
import { SnowCard } from "../components/SnowCard";
import { useManualReport } from "../hooks/mutations";
import { useSkiOverview } from "../hooks/queries";
import { useSkiErrorMessage } from "../lib/useErrorMessage";

type Sheet = { resort: TripResort; open: boolean };

function ReportSheet({ tripId, sheet, onClose }: { tripId: string; sheet: Sheet; onClose: () => void }) {
  const errorMessage = useSkiErrorMessage();
  const report = useManualReport(tripId, sheet.resort.resort.id);

  return (
    <ManualReportForm
      open={sheet.open}
      resortName={sheet.resort.resort.name}
      pending={report.isPending}
      errorMessage={report.isError ? errorMessage(report.error) : undefined}
      onCancel={() => {
        report.reset();
        onClose();
      }}
      onSubmit={(body) => report.mutate(body, { onSuccess: onClose })}
    />
  );
}

/** Container: the latest conditions of every trip resort, with a manual-report sheet. */
export function ConditionsPanel({ tripId }: { tripId: string }) {
  const t = useTranslations("ski");
  const id = useId();
  const { data: overview, isPending } = useSkiOverview(tripId);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  if (isPending) return <Skeleton className="h-40" />;
  if (!overview) return null;

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t("conditions.title")}</h2>
      {overview.resorts.length === 0 ? (
        <EmptyState title={t("empty.resorts")} />
      ) : (
        overview.resorts.map((tripResort) => (
          <SnowCard
            key={tripResort.resort.id}
            resortName={tripResort.resort.name}
            report={tripResort.latest_report}
            actions={
              <Button variant="link" onClick={() => setSheet({ resort: tripResort, open: true })}>
                {t("conditions.report")}
              </Button>
            }
          />
        ))
      )}
      {sheet && (
        <ReportSheet
          key={sheet.resort.resort.id}
          tripId={tripId}
          sheet={sheet}
          onClose={() => setSheet({ ...sheet, open: false })}
        />
      )}
    </section>
  );
}
