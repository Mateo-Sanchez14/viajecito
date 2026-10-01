"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useDateRange } from "@/features/trips/lib/useDateRange";
import { useTripContext } from "@/features/trips/TripProvider";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { ConfirmDialog } from "@/ui/molecules/ConfirmDialog";
import { EmptyState } from "@/ui/molecules/EmptyState";
import type { BestWindow, Decision } from "../api/dates";
import { DecisionOutcome } from "../components/DecisionOutcome";
import { useCloseDecision, useReopenDecision } from "../hooks/mutations";
import { useDecisions } from "../hooks/queries";
import { useDatesError } from "../lib/useDatesError";
import { useDayFormat } from "../lib/useDayFormat";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { OpenDecisionForm } from "./OpenDecisionForm";

/** Container of the dates section: form, open voting or closed outcome, depending on the decision. */
export function DatesPlanner({ tripId }: { tripId: string }) {
  const t = useTranslations("dates");
  const errorMessage = useDatesError();
  const { data: decisions, isPending, isError, error, refetch } = useDecisions(tripId);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {isPending ? (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-warn">{errorMessage(error)}</p>
          <Button variant="link" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <Planner tripId={tripId} decisions={decisions} />
      )}
    </div>
  );
}

function Planner({ tripId, decisions }: { tripId: string; decisions: Decision[] }) {
  // Newest first: an open decision wins, otherwise the latest one (closed).
  const current = decisions.find((d) => d.status === "open") ?? decisions[0];
  if (!current) return <NoDecision tripId={tripId} />;
  return current.status === "open" ? (
    <OpenView key={current.id} tripId={tripId} decision={current} />
  ) : (
    <ClosedView key={current.id} tripId={tripId} decision={current} />
  );
}

function NoDecision({ tripId }: { tripId: string }) {
  const t = useTranslations("dates.empty");
  const dateRange = useDateRange();
  const { trip } = useTripContext();
  const hasDates = Boolean(trip.start_on || trip.end_on);
  const [showForm, setShowForm] = useState(!hasDates);

  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        title={t("title")}
        description={hasDates ? t("tripDates", { range: dateRange(trip.start_on, trip.end_on) }) : t("description")}
        action={
          !showForm && (
            <Button variant="link" onClick={() => setShowForm(true)}>
              {t("voteOther")}
            </Button>
          )
        }
      />
      {showForm && (
        <Card>
          <OpenDecisionForm tripId={tripId} />
        </Card>
      )}
    </div>
  );
}

function OpenView({ tripId, decision }: { tripId: string; decision: Decision }) {
  const t = useTranslations("dates");
  const day = useDayFormat();
  const errorMessage = useDatesError();
  const { trip } = useTripContext();
  const close = useCloseDecision(tripId, decision.id);
  const [candidate, setCandidate] = useState<BestWindow | null>(null);
  const [editing, setEditing] = useState(false);
  const replacesDates = Boolean(trip.start_on || trip.end_on);

  function confirmClose() {
    if (!candidate) return;
    close.mutate({ start_on: candidate.start, end_on: candidate.end }, { onSettled: () => setCandidate(null) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          {[
            t("windowLine", { start: day.short(decision.window_start), end: day.short(decision.window_end) }),
            t("overview.voted", { n: decision.respondents, total: decision.eligible }),
            decision.deadline && t("deadline", { date: day.dateTime(decision.deadline) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {!editing && (
          <Button variant="link" onClick={() => setEditing(true)}>
            {t("open.edit")}
          </Button>
        )}
      </div>
      {editing && (
        <Card>
          <OpenDecisionForm
            tripId={tripId}
            decision={decision}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </Card>
      )}
      {close.isError && (
        <p role="alert" className="text-sm text-warn">
          {errorMessage(close.error)}
        </p>
      )}
      <AvailabilityEditor decisionId={decision.id} onCloseWindow={setCandidate} closing={close.isPending} />
      <ConfirmDialog
        open={candidate !== null}
        title={t("confirm.close", {
          start: candidate ? day.short(candidate.start) : "",
          end: candidate ? day.short(candidate.end) : "",
        })}
        description={replacesDates ? t("confirm.overwrite") : undefined}
        confirmLabel={t("confirm.closeAction")}
        cancelLabel={t("confirm.cancel")}
        onConfirm={confirmClose}
        onCancel={() => setCandidate(null)}
      />
    </div>
  );
}

function ClosedView({ tripId, decision }: { tripId: string; decision: Decision }) {
  const t = useTranslations("dates.confirm");
  const errorMessage = useDatesError();
  const reopen = useReopenDecision(tripId, decision.id);
  const [confirming, setConfirming] = useState(false);
  const [voteOther, setVoteOther] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <DecisionOutcome
        decision={decision}
        busy={reopen.isPending}
        onReopen={() => setConfirming(true)}
        onVoteOther={voteOther ? undefined : () => setVoteOther(true)}
      />
      {reopen.isError && (
        <p role="alert" className="text-sm text-warn">
          {errorMessage(reopen.error)}
        </p>
      )}
      {voteOther && (
        <Card>
          <OpenDecisionForm tripId={tripId} onCancel={() => setVoteOther(false)} />
        </Card>
      )}
      <ConfirmDialog
        open={confirming}
        title={t("reopen")}
        description={t("reopenDescription")}
        confirmLabel={t("reopenAction")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          setConfirming(false);
          reopen.mutate();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
