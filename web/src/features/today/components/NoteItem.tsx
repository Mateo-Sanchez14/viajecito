"use client";
import { useTranslations } from "next-intl";
import type { Note } from "@/features/itinerary/api/itinerary";
export function NoteItem({
  note,
  onPin,
  onDelete,
  pending,
}: {
  note: Note;
  onPin: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const t = useTranslations("today.notes");
  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      {note.pinned && (
        <span className="text-sm font-medium">{t("pinned")}</span>
      )}
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
      <p className="text-sm text-muted">{note.author.display_name}</p>
      <div className="flex gap-3">
        <button
          type="button"
          className="min-h-11 px-2"
          onClick={onPin}
          disabled={pending}
        >
          {t(note.pinned ? "unpin" : "pin")}
        </button>
        {note.can_delete && (
          <button
            type="button"
            className="min-h-11 px-2"
            onClick={onDelete}
            disabled={pending}
          >
            {t("delete")}
          </button>
        )}
      </div>
    </li>
  );
}
