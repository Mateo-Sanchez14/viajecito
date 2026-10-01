"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import {
  EMPTY_REPORT,
  validateReport,
  type ReportErrorKey,
  type ReportField,
  type ReportInput,
} from "../lib/report";
import type { ManualReportIn } from "../api/ski";

type ManualReportFormProps = {
  open: boolean;
  resortName: string;
  pending: boolean;
  /** Already-translated api error to show under the form. */
  errorMessage?: string;
  onSubmit: (body: ManualReportIn) => void;
  onCancel: () => void;
};

const FIELDS: { field: ReportField; label: "base" | "new24h" | "temp" | "liftsOpen" | "liftsTotal" | "runsOpen" | "runsTotal"; step: number }[] = [
  { field: "base_cm", label: "base", step: 1 },
  { field: "new_24h_cm", label: "new24h", step: 1 },
  { field: "temp_c", label: "temp", step: 0.5 },
  { field: "lifts_open", label: "liftsOpen", step: 1 },
  { field: "lifts_total", label: "liftsTotal", step: 1 },
  { field: "runs_open", label: "runsOpen", step: 1 },
  { field: "runs_total", label: "runsTotal", step: 1 },
];

function Fields(props: Omit<ManualReportFormProps, "open">) {
  const { resortName, pending, errorMessage, onSubmit, onCancel } = props;
  const t = useTranslations("ski.report");
  const id = useId();
  const [input, setInput] = useState<ReportInput>(EMPTY_REPORT);
  const [errors, setErrors] = useState<Partial<Record<ReportField, ReportErrorKey>>>({});
  const [formError, setFormError] = useState<ReportErrorKey | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateReport(input);
    if (result.ok) {
      setErrors({});
      setFormError(null);
      onSubmit(result.body);
    } else {
      setErrors(result.errors);
      setFormError(result.form ?? null);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("title", { resort: resortName })}</h2>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ field, label, step }) => (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor={`${id}-${field}`} className="text-sm font-medium">{t(label)}</label>
            <Input
              id={`${id}-${field}`}
              type="number"
              inputMode="decimal"
              step={step}
              value={input[field]}
              invalid={Boolean(errors[field])}
              aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
              onChange={(e) => setInput((current) => ({ ...current, [field]: e.target.value }))}
            />
            {errors[field] && (
              <p id={`${id}-${field}-error`} role="alert" className="text-sm text-warn">
                {t(`errors.${errors[field]}`)}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-status`} className="text-sm font-medium">{t("status")}</label>
        <Input
          id={`${id}-status`}
          maxLength={280}
          value={input.status_text}
          onChange={(e) => setInput((current) => ({ ...current, status_text: e.target.value }))}
        />
      </div>
      {formError && <p role="alert" className="text-sm text-warn">{t(`errors.${formError}`)}</p>}
      {errorMessage && <p role="alert" className="text-sm text-warn">{errorMessage}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="link" onClick={onCancel}>{t("cancel")}</Button>
        <Button type="submit" disabled={pending} className="w-auto!">{t("submit")}</Button>
      </div>
    </form>
  );
}

/** Presentational sheet (native modal dialog) to post a manual snow report. */
export function ManualReportForm({ open, ...rest }: ManualReportFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={rest.resortName}
      onCancel={(event) => {
        event.preventDefault();
        rest.onCancel();
      }}
      className="m-auto w-[min(94vw,32rem)] rounded-2xl border border-border bg-surface p-6 text-foreground backdrop:bg-black/50"
    >
      {open && <Fields {...rest} />}
    </dialog>
  );
}
