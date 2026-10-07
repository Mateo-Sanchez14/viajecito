"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import type { Entry } from "../api/itinerary";
import { EntryRow } from "../components/EntryRow";
import { DayColumn } from "../components/DayColumn";
import { TrayList } from "../components/TrayList";
import { useItinerary } from "../hooks/queries";
import {
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
  useMoveEntry,
} from "../hooks/mutations";
import { EntryForm } from "./EntryForm";
import { DayHeaderEditor } from "./DayHeaderEditor";
export function ItineraryPlanner({ tripId }: { tripId: string }) {
  const t = useTranslations("itinerary");
  const errors = useTranslations("itinerary.errors");
  const { data, isPending, isError } = useItinerary(tripId);
  const create = useCreateEntry(tripId);
  const update = useUpdateEntry(tripId);
  const remove = useDeleteEntry(tripId);
  const move = useMoveEntry(tripId);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
    } catch (cause) {
      setError(
        cause instanceof ApiError && errors.has(cause.code)
          ? cause.code
          : "unknown",
      );
    }
  }
  function row(entry: Entry) {
    return (
      <EntryRow
        key={entry.id}
        entry={entry}
        pending={move.isPending || remove.isPending}
        onEdit={() => setEditing(entry)}
        onDelete={() => void run(() => remove.mutateAsync(entry.id))}
        onMove={(direction) =>
          void run(() => move.mutateAsync({ id: entry.id, direction }))
        }
      />
    );
  }
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <button
          className="min-h-11 rounded border border-border px-4"
          onClick={() => setEditing("new")}
          disabled={!data}
        >
          {t("entry.add")}
        </button>
      </header>
      {isPending && <p role="status">{t("loading")}</p>}
      {isError && <p role="alert">{errors("load")}</p>}
      {error && <p role="alert">{errors(error)}</p>}
      {data && (
        <>
          <p className="text-sm text-muted">
            {t("timezone", { timezone: data.timezone })}
          </p>
          {editing && (
            <EntryForm
              key={editing === "new" ? "new" : editing.id}
              entry={editing === "new" ? undefined : editing}
              days={data.days}
              pending={create.isPending || update.isPending}
              onCancel={() => setEditing(null)}
              onSave={(body) =>
                editing === "new"
                  ? create.mutateAsync(body)
                  : update.mutateAsync({ id: editing.id, body })
              }
            />
          )}
          {data.days.map((day, index) => (
            <DayColumn
              key={day.date}
              label={day.title || t("day.untitled", { n: index + 1 })}
              header={
                <DayHeaderEditor day={day} index={index} tripId={tripId} />
              }
            >
              {day.entries.map(row)}
            </DayColumn>
          ))}
          <TrayList title={t("tray.title")} help={t("tray.help")}>
            {data.tray.map(row)}
          </TrayList>
          {data.out_of_range.length > 0 && (
            <TrayList title={t("outOfRange.title")}>
              {data.out_of_range.map(row)}
            </TrayList>
          )}
          {!data.days.some((day) => day.entries.length) &&
            !data.tray.length &&
            !data.out_of_range.length && (
              <EmptyState art={<EmptyArt scene="map" />} title={t("empty")} />
            )}
        </>
      )}
    </div>
  );
}
