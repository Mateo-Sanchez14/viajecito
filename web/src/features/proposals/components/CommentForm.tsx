"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Textarea } from "@/ui/atoms/Textarea";

export const COMMENT_MAX = 2000;

type CommentFormProps = {
  /** Resolves when the comment was saved so the field can be cleared; a rejection keeps the text. */
  onSubmit: (body: string) => Promise<unknown>;
  pending?: boolean;
  error?: string | null;
};

/** Comment box with a character counter (1 to 2000 characters, blank is not a comment). */
export function CommentForm({ onSubmit, pending = false, error = null }: CommentFormProps) {
  const t = useTranslations("proposals.comments");
  const id = useId();
  const [value, setValue] = useState("");
  const body = value.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body) return;
    try {
      await onSubmit(body);
      setValue("");
    } catch {
      // The parent shows the error; the text stays so nothing is lost.
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={`${id}-body`} className="text-sm font-medium">
        {t("label")}
      </label>
      <Textarea
        id={`${id}-body`}
        rows={3}
        maxLength={COMMENT_MAX}
        value={value}
        placeholder={t("placeholder")}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={`${id}-counter`}
      />
      <p id={`${id}-counter`} className="text-right text-sm text-muted">
        {t("counter", { count: value.length, max: COMMENT_MAX })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !body}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
