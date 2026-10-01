"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import type { Decision } from "../api/dates";
import { useOpenDecision, useUpdateDecision } from "../hooks/mutations";
import {
  parseDecisionForm,
  type DecisionFormField,
  type DecisionFormValues,
} from "../lib/decisionForm";
import { useDatesError } from "../lib/useDatesError";

type OpenDecisionFormProps = {
  tripId: string;
  /** When present the form edits this open decision instead of opening a new one. */
  decision?: Decision;
  onDone?: () => void;
  onCancel?: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as the `datetime-local` value the viewer would type (their own timezone). */
function toLocalInput(instant: string | null | undefined): string {
  if (!instant) return "";
  const d = new Date(instant);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialValues(decision?: Decision): DecisionFormValues {
  if (!decision) return { from: "", to: "", minDays: "7", maxDays: "", deadline: "", maybeWeight: "0.5" };
  return {
    from: decision.window_start,
    to: decision.window_end,
    minDays: String(decision.min_days),
    maxDays: decision.max_days === decision.min_days ? "" : String(decision.max_days),
    deadline: toLocalInput(decision.deadline),
    maybeWeight: String(Number(decision.maybe_weight)),
  };
}

/** Container: open a dates decision, or edit the open one. Validates like the api before sending. */
export function OpenDecisionForm({ tripId, decision, onDone, onCancel }: OpenDecisionFormProps) {
  const t = useTranslations("dates.open");
  const errorMessage = useDatesError();
  const id = useId();
  const opening = useOpenDecision(tripId);
  const updating = useUpdateDecision(tripId, decision?.id ?? "");
  const mutation = decision ? updating : opening;
  const [values, setValues] = useState(() => initialValues(decision));
  const [errors, setErrors] = useState<Partial<Record<DecisionFormField, string>>>({});

  const set = (key: keyof DecisionFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // An unchanged deadline is kept as is, even when it has already passed.
    const keepsDeadline = Boolean(decision?.deadline) && values.deadline === toLocalInput(decision?.deadline);
    const result = parseDecisionForm({ ...values, deadline: keepsDeadline ? "" : values.deadline }, new Date());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const value = keepsDeadline ? { ...result.value, deadline: decision?.deadline ?? null } : result.value;
    const done = { onSuccess: () => onDone?.() };
    if (decision) updating.mutate(value, done);
    else {
      const { deadline, ...rest } = value;
      opening.mutate({ kind: "dates", ...rest, ...(deadline ? { deadline } : {}) }, done);
    }
  }

  const fieldError = (field: DecisionFormField) => (errors[field] ? t(`errors.${errors[field]}`) : null);
  const describedBy = (field: DecisionFormField) => (errors[field] ? `${id}-${field}-error` : undefined);
  const error = (field: DecisionFormField) =>
    errors[field] && (
      <p id={`${id}-${field}-error`} role="alert" className="text-sm text-warn">
        {fieldError(field)}
      </p>
    );

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{decision ? t("edit") : t("title")}</h2>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("range")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-from`} className="text-sm text-muted">{t("from")}</label>
            <Input
              id={`${id}-from`}
              type="date"
              value={values.from}
              onChange={(e) => set("from")(e.target.value)}
              invalid={Boolean(errors.range)}
              aria-describedby={describedBy("range")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-to`} className="text-sm text-muted">{t("to")}</label>
            <Input
              id={`${id}-to`}
              type="date"
              value={values.to}
              onChange={(e) => set("to")(e.target.value)}
              invalid={Boolean(errors.range)}
              aria-describedby={describedBy("range")}
            />
          </div>
        </div>
        {error("range")}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-min`} className="text-sm font-medium">{t("minDays")}</label>
          <Input
            id={`${id}-min`}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={values.minDays}
            onChange={(e) => set("minDays")(e.target.value)}
            invalid={Boolean(errors.minDays)}
            aria-describedby={describedBy("minDays")}
          />
          {error("minDays")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-max`} className="text-sm font-medium">{t("maxDays")}</label>
          <Input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={values.maxDays}
            onChange={(e) => set("maxDays")(e.target.value)}
            invalid={Boolean(errors.maxDays)}
            aria-describedby={describedBy("maxDays")}
          />
          {error("maxDays")}
        </div>
        <p className="col-span-2 -mt-2 text-sm text-muted">{t("maxDaysHint")}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-deadline`} className="text-sm font-medium">{t("deadline")}</label>
        <Input
          id={`${id}-deadline`}
          type="datetime-local"
          value={values.deadline}
          onChange={(e) => set("deadline")(e.target.value)}
          invalid={Boolean(errors.deadline)}
          aria-describedby={describedBy("deadline")}
        />
        <p className="text-sm text-muted">{t("deadlineHint")}</p>
        {error("deadline")}
      </div>

      <details className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">{t("advanced")}</summary>
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor={`${id}-weight`} className="text-sm font-medium">{t("maybeWeight")}</label>
          <Input
            id={`${id}-weight`}
            type="number"
            inputMode="decimal"
            min={0}
            max={1}
            step={0.05}
            value={values.maybeWeight}
            onChange={(e) => set("maybeWeight")(e.target.value)}
            invalid={Boolean(errors.maybeWeight)}
            aria-describedby={describedBy("maybeWeight")}
          />
          <p className="text-sm text-muted">{t("maybeWeightHint")}</p>
          {error("maybeWeight")}
        </div>
      </details>

      {mutation.isError && (
        <p role="alert" className="text-sm text-warn">{errorMessage(mutation.error)}</p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="flex-1" disabled={mutation.isPending}>
          {decision
            ? mutation.isPending ? t("saving") : t("save")
            : mutation.isPending ? t("submitting") : t("submit")}
        </Button>
        {onCancel && (
          <Button variant="link" onClick={onCancel}>{t("cancel")}</Button>
        )}
      </div>
    </form>
  );
}
