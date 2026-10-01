"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";
import { useNotes } from "@/features/itinerary/hooks/queries";
import {
  useAddNote,
  useUpdateNote,
  useDeleteNote,
} from "@/features/itinerary/hooks/mutations";
import type { Note } from "@/features/itinerary/api/itinerary";
import { NoteComposer } from "../components/NoteComposer";
import { NoteItem } from "../components/NoteItem";
export function QuickNotes({
  tripId,
  initialNotes = [],
}: {
  tripId: string;
  initialNotes?: Note[];
}) {
  const t = useTranslations("today.notes");
  const errors = useTranslations("today.notes.errors");
  const { data, isError } = useNotes(tripId, true);
  const add = useAddNote(tripId);
  const update = useUpdateNote(tripId);
  const remove = useDeleteNote(tripId);
  const [error, setError] = useState<string | null>(null);
  const notes = data ?? initialNotes;
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
      throw cause;
    }
  }
  const pending = add.isPending || update.isPending || remove.isPending;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {isError && <p role="status">{t("loadError")}</p>}
      {error && <p role="alert">{errors(error)}</p>}
      <NoteComposer
        pending={pending}
        onSave={(body) => run(() => add.mutateAsync({ body, pinned: false }))}
      />
      <ul className="space-y-2">
        {notes.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            pending={pending}
            onPin={() =>
              void run(() =>
                update.mutateAsync({
                  id: note.id,
                  body: { pinned: !note.pinned },
                }),
              ).catch(() => undefined)
            }
            onDelete={() =>
              void run(() => remove.mutateAsync(note.id)).catch(() => undefined)
            }
          />
        ))}
      </ul>
      {!notes.length && <p className="text-sm text-muted">{t("empty")}</p>}
    </section>
  );
}
