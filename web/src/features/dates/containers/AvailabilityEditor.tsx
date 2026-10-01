"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui/atoms/Button";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { ApiError } from "@/shared/api/errors";
import { datesKeys, setAvailability, type BestWindow } from "../api/dates";
import { AvailabilityGrid } from "../components/AvailabilityGrid";
import { BestWindowsPanel } from "../components/BestWindowsPanel";
import { CrewHeatmap } from "../components/CrewHeatmap";
import { NonResponders } from "../components/NonResponders";
import { useSetAvailability } from "../hooks/mutations";
import { useAvailability } from "../hooks/queries";
import type { Answer, CellValue } from "../lib/calendar";
import { useDatesError } from "../lib/useDatesError";

export const SAVE_DEBOUNCE_MS = 800;

type Edits = Record<string, CellValue>;

type AvailabilityEditorProps = {
  decisionId: string;
  onCloseWindow: (window: BestWindow) => void;
  /** True while the decision is being closed (disables the close buttons). */
  closing?: boolean;
  /** Overridable so tests do not wait the real 800 ms. */
  debounceMs?: number;
};

function toBatch(edits: Edits) {
  return Object.entries(edits)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, answer]) => ({ date, answer }));
}

/**
 * Container: my availability grid plus the group's heatmap, the best windows and who is missing.
 * My taps are optimistic and saved as one debounced batch `PUT`; a failed save rolls the cells back.
 * Polling is paused while edits are pending so a refetch never overwrites them.
 */
export function AvailabilityEditor({
  decisionId,
  onCloseWindow,
  closing = false,
  debounceMs = SAVE_DEBOUNCE_MS,
}: AvailabilityEditorProps) {
  const t = useTranslations("dates");
  const errorMessage = useDatesError();
  const queryClient = useQueryClient();
  const save = useSetAvailability(decisionId);
  // `overlay` is what the grid shows on top of the server's grid; `queue` is what is not sent yet.
  const [overlay, setOverlay] = useState<Edits>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const queue = useRef<Edits>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = Object.keys(overlay).length > 0;
  const { data, isPending, isError, error, refetch } = useAvailability(decisionId, { paused: pending });
  const tripId = data?.decision.trip_id;

  const mine = useMemo(() => {
    const server = data?.people.find((person) => person.person_id === data.me)?.answers ?? {};
    const merged: Record<string, Answer> = { ...server };
    for (const [date, value] of Object.entries(overlay)) {
      if (value) merged[date] = value;
      else delete merged[date];
    }
    return merged;
  }, [data, overlay]);

  function settle(batch: Edits) {
    // Drop what this request covered, unless the person tapped the cell again in the meantime.
    const requeued = new Set(Object.keys(queue.current));
    setOverlay((current) => {
      const next = { ...current };
      for (const [date, value] of Object.entries(batch)) {
        if (!requeued.has(date) && next[date] === value) delete next[date];
      }
      return next;
    });
  }

  function flush() {
    clearTimeout(timer.current);
    const batch = queue.current;
    queue.current = {};
    if (Object.keys(batch).length === 0) return;
    // Requests run one after another so a slow older response never overwrites a newer grid.
    chain.current = chain.current.then(() =>
      save
        .mutateAsync(toBatch(batch))
        .then((response) => {
          queryClient.setQueryData(datesKeys.availability(decisionId), response);
          settle(batch);
        })
        .catch((failure: unknown) => {
          settle(batch);
          setSaveError(errorMessage(failure));
          if (failure instanceof ApiError && failure.code === "decision_closed" && tripId) {
            void queryClient.invalidateQueries({ queryKey: datesKeys.decisions(tripId) });
          }
        }),
    );
  }

  function onChange(changes: Edits) {
    setSaveError(null);
    setOverlay((current) => ({ ...current, ...changes }));
    queue.current = { ...queue.current, ...changes };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, debounceMs);
  }

  // Leaving the page within the debounce window must not lose the last taps.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const batch = queue.current;
      queue.current = {};
      if (Object.keys(batch).length > 0) void setAvailability(decisionId, toBatch(batch)).catch(() => {});
    },
    [decisionId],
  );

  if (isPending) {
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-warn">{errorMessage(error)}</p>
        <Button variant="link" onClick={() => void refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <AvailabilityGrid dates={data.dates} answers={mine} onChange={onChange} />
        {pending && !saveError && <p className="text-sm text-muted">{t("grid.saving")}</p>}
        {saveError && (
          <p role="alert" className="text-sm text-warn">
            {saveError}
          </p>
        )}
      </section>
      <CrewHeatmap dates={data.dates} people={data.people.filter((person) => person.person_id !== data.me)} />
      <BestWindowsPanel
        windows={data.best_windows}
        hasData={data.has_data}
        onClose={onCloseWindow}
        disabled={closing}
      />
      <NonResponders people={data.non_responders} />
    </div>
  );
}
