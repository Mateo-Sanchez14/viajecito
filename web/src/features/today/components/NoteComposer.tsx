"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
export function NoteComposer({
  onSave,
  pending,
}: {
  onSave: (body: string) => Promise<void>;
  pending: boolean;
}) {
  const t = useTranslations("today.notes");
  const [body, setBody] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || body.length > 1000) return;
    await onSave(body.trim());
    setBody("");
  }
  return (
    <form
      onSubmit={(event) => void submit(event).catch(() => undefined)}
      className="space-y-2"
    >
      <textarea
        aria-label={t("placeholder")}
        placeholder={t("placeholder")}
        className="block w-full rounded border border-border bg-surface p-3"
        maxLength={1000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
      />
      <button
        className="min-h-11 rounded border border-border px-4"
        disabled={pending || !body.trim()}
      >
        {t("save")}
      </button>
    </form>
  );
}
