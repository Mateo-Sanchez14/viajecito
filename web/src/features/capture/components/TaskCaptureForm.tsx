"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { TaskCreate } from "@/features/logistics/api/logistics";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { useCreateTask } from "../hooks/useCaptureMutations";
import { useFocusOnMount } from "../hooks/useFocusOnMount";
import { toCaptureError, type CaptureErrorKey } from "../lib/errors";

const KINDS = ["todo", "bring", "booking"] as const satisfies readonly NonNullable<TaskCreate["kind"]>[];

type TaskCaptureFormProps = {
  tripId: string | null;
  onBack: () => void;
  onCreated: () => void;
};

/** A to-do for the logistics board: a title, a kind (a plain to-do unless changed) and maybe a day. */
export function TaskCaptureForm({ tripId, onBack, onCreated }: TaskCaptureFormProps) {
  const t = useTranslations("capture");
  const tKind = useTranslations("logistics.task.kind");
  const create = useCreateTask(tripId);
  const titleRef = useFocusOnMount<HTMLInputElement>();
  const errorId = useId();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("todo");
  const [due, setDue] = useState("");
  const [error, setError] = useState<CaptureErrorKey | "titleRequired" | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending || !tripId) return;
    if (!title.trim()) return setError("titleRequired");

    setError(null);
    create.mutate(
      { title: title.trim(), kind, ...(due ? { due_on: due } : {}) },
      { onSuccess: onCreated, onError: (failure) => setError(toCaptureError(failure).key) },
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="capture-form" aria-label={t("task.title")}>
      <label className="ui-field">
        {t("task.name")}
        <Input
          ref={titleRef}
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <p id={errorId} role="alert" className="capture-error">
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="capture-price-row">
        <label className="ui-field">
          {t("task.kind")}
          <Select value={kind} onChange={(event) => setKind(event.target.value as (typeof KINDS)[number])}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {tKind(value)}
              </option>
            ))}
          </Select>
        </label>
        <label className="ui-field">
          {t("task.due")}
          <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
      </div>
      {!tripId && <p className="ui-hint">{t("errors.tripRequired")}</p>}
      <div className="capture-actions">
        <Button type="submit" className="ui-button-auto" disabled={create.isPending || !tripId}>
          {create.isPending ? t("task.submitting") : t("task.submit")}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}
