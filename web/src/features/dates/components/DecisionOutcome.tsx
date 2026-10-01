"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import type { Decision } from "../api/dates";
import { useDayFormat } from "../lib/useDayFormat";

type DecisionOutcomeProps = {
  decision: Decision;
  onReopen: () => void;
  /** Shown as a secondary action when present (opens the form for a new decision). */
  onVoteOther?: () => void;
  busy?: boolean;
};

/** Presentational: the dates a closed decision settled on, with reopen. */
export function DecisionOutcome({ decision, onReopen, onVoteOther, busy = false }: DecisionOutcomeProps) {
  const t = useTranslations("dates.closed");
  const other = useTranslations("dates.empty");
  const day = useDayFormat();

  return (
    <Card as="section" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {decision.outcome_start && decision.outcome_end && (
        <p className="text-2xl font-semibold">
          {t("line", { start: day.short(decision.outcome_start), end: day.short(decision.outcome_end) })}
        </p>
      )}
      {decision.closed_by && <p className="text-sm text-muted">{t("closedBy", { name: decision.closed_by.display_name })}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button className="w-auto!" disabled={busy} onClick={onReopen}>
          {t("reopen")}
        </Button>
        {onVoteOther && (
          <Button variant="link" onClick={onVoteOther}>
            {other("voteOther")}
          </Button>
        )}
      </div>
    </Card>
  );
}
