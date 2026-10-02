"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";
import type { Day, Entry, EntryCreate } from "../api/itinerary";
import { validateEntry } from "../lib/entries";
const kinds: Entry["kind"][] = [
  "activity",
  "transport",
  "lodging",
  "meal",
  "meeting",
  "ski",
  "other",
];
export function EntryForm({
  days,
  entry,
  onSave,
  onCancel,
  pending,
}: {
  days: Day[];
  entry?: Entry;
  onSave: (body: EntryCreate) => Promise<unknown>;
  onCancel: () => void;
  pending: boolean;
}) {
  const t = useTranslations("itinerary.entry");
  const errors = useTranslations("itinerary.errors");
  const tray = useTranslations("itinerary.tray");
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = sheet.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const day = String(form.get("day_date") ?? "");
    const body: EntryCreate = {
      title: String(form.get("title") ?? "").trim(),
      kind: String(form.get("kind")) as Entry["kind"],
      day_date: day || null,
      start_time: String(form.get("start_time") ?? "") || null,
      end_time: String(form.get("end_time") ?? "") || null,
      location_label: String(form.get("location_label") ?? ""),
      lat: form.get("lat") ? Number(form.get("lat")) : null,
      lng: form.get("lng") ? Number(form.get("lng")) : null,
      is_meeting_point: form.get("is_meeting_point") === "on",
      notes: String(form.get("notes") ?? ""),
    };
    const invalid = validateEntry(body);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      setError(null);
      await onSave(body);
      onCancel();
    } catch (cause) {
      setError(
        cause instanceof ApiError && errors.has(cause.code)
          ? cause.code
          : "unknown",
      );
    }
  }
  const field =
    "block min-h-11 w-full rounded border border-border bg-surface px-3";
  return (
    <dialog
      ref={sheet}
      aria-label={t(entry ? "editTitle" : "formTitle")}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-surface p-0 text-foreground backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:rounded-2xl"
    >
      <form
        aria-label={t(entry ? "editTitle" : "formTitle")}
        onSubmit={submit}
        className="space-y-3 rounded-2xl border border-border bg-surface p-4"
      >
        <h2 className="text-lg font-semibold">
          {t(entry ? "editTitle" : "formTitle")}
        </h2>
        <label className="block">
          {t("title")}
          <input
            className={field}
            name="title"
            maxLength={200}
            defaultValue={entry?.title}
            required
          />
        </label>
        <label className="block">
          {t("day")}
          <select
            name="day_date"
            onChange={(event) => {
              if (event.target.value) return;
              const form = event.target.form;
              for (const name of ["start_time", "end_time"]) {
                const input = form?.elements.namedItem(name);
                if (input instanceof HTMLInputElement) input.value = "";
              }
            }}
            className={field}
            defaultValue={entry?.day_date ?? ""}
          >
            <option value="">{tray("title")}</option>
            {entry?.day_date &&
              !days.some((d) => d.date === entry.day_date) && (
                <option value={entry.day_date}>{entry.day_date}</option>
              )}
            {days
              .filter((day) => day.date)
              .map((day) => (
                <option key={day.date} value={day.date!}>
                  {day.date} {day.title}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          {t("kindLabel")}
          <select
            name="kind"
            className={field}
            defaultValue={entry?.kind ?? "activity"}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            {t("time")}
            <input
              className={field}
              name="start_time"
              type="time"
              defaultValue={entry?.start_time ?? ""}
            />
          </label>
          <label>
            {t("endTime")}
            <input
              className={field}
              name="end_time"
              type="time"
              defaultValue={entry?.end_time ?? ""}
            />
          </label>
        </div>
        <label className="block">
          {t("location")}
          <input
            className={field}
            name="location_label"
            maxLength={200}
            defaultValue={entry?.location_label}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            {t("lat")}
            <input
              className={field}
              name="lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              defaultValue={entry?.lat ?? ""}
            />
          </label>
          <label>
            {t("lng")}
            <input
              className={field}
              name="lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              defaultValue={entry?.lng ?? ""}
            />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input
            name="is_meeting_point"
            type="checkbox"
            defaultChecked={entry?.is_meeting_point}
          />
          {t("meetingPoint")}
        </label>
        <label className="block">
          {t("notes")}
          <textarea
            className={field}
            name="notes"
            maxLength={1000}
            defaultValue={entry?.notes}
          />
        </label>
        {error && <p role="alert">{errors(error)}</p>}
        <div className="flex gap-3">
          <button
            className="min-h-11 rounded border border-border px-4"
            disabled={pending}
          >
            {t("save")}
          </button>
          <button type="button" className="min-h-11 px-4" onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
