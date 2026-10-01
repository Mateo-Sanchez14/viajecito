"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";
import type { Day } from "../api/itinerary";
import { useSaveDay } from "../hooks/mutations";
export function DayHeaderEditor({
  day,
  index,
  tripId,
}: {
  day: Day;
  index: number;
  tripId: string;
}) {
  const t = useTranslations("itinerary.day");
  const errors = useTranslations("itinerary.errors");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveDay(tripId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await save.mutateAsync({
        date: day.date!,
        body: {
          title: String(form.get("title") ?? ""),
          notes: String(form.get("notes") ?? ""),
        },
      });
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof ApiError && errors.has(cause.code)
          ? cause.code
          : "unknown",
      );
    }
  }
  return (
    <header className="space-y-2">
      <h2 className="text-lg font-semibold">
        {day.title || t("untitled", { n: index + 1 })}
      </h2>
      <p className="text-sm text-muted">{day.date}</p>
      {day.notes && (
        <p className="whitespace-pre-wrap break-words text-sm">{day.notes}</p>
      )}
      <button
        type="button"
        className="min-h-11 px-2"
        onClick={() => setEditing(!editing)}
      >
        {t("edit")}
      </button>
      {editing && (
        <form onSubmit={submit} className="space-y-2">
          <label className="block">
            {t("title")}
            <input
              className="block min-h-11 w-full rounded border border-border px-3"
              name="title"
              defaultValue={day.title}
              maxLength={120}
            />
          </label>
          <label className="block">
            {t("notes")}
            <textarea
              className="block w-full rounded border border-border px-3"
              name="notes"
              defaultValue={day.notes}
              maxLength={2000}
            />
          </label>
          {error && <p role="alert">{errors(error)}</p>}
          <button
            disabled={save.isPending}
            className="min-h-11 rounded border border-border px-3"
          >
            {t("save")}
          </button>
        </form>
      )}
    </header>
  );
}
