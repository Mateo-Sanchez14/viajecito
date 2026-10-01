import { daysBetween } from "./calendar";

export type DecisionFormValues = {
  from: string;
  to: string;
  minDays: string;
  maxDays: string;
  /** `datetime-local` value (viewer's timezone) or empty. */
  deadline: string;
  maybeWeight: string;
};

export type DecisionFormField = "range" | "minDays" | "maxDays" | "deadline" | "maybeWeight";
export type DecisionFormErrorKey =
  | "rangeRequired"
  | "endBeforeStart"
  | "rangeTooLong"
  | "minDaysInvalid"
  | "maxDaysInvalid"
  | "minExceedsRange"
  | "deadlinePast"
  | "weightInvalid";

export type ParsedDecision = {
  window_start: string;
  window_end: string;
  min_days: number;
  max_days: number;
  maybe_weight: string;
  deadline: string | null;
};

export type DecisionFormResult =
  | { ok: true; value: ParsedDecision }
  | { ok: false; errors: Partial<Record<DecisionFormField, DecisionFormErrorKey>> };

export const MAX_RANGE_DAYS = 180;
export const MAX_TRIP_DAYS = 60;

const INTEGER = /^\d+$/;
const inBounds = (value: string) => INTEGER.test(value) && Number(value) >= 1 && Number(value) <= MAX_TRIP_DAYS;

/** Validates the open/edit form the way the api does, so most mistakes never reach it. */
export function parseDecisionForm(values: DecisionFormValues, now: Date): DecisionFormResult {
  const errors: Partial<Record<DecisionFormField, DecisionFormErrorKey>> = {};
  const { from, to } = values;
  let span = 0;

  if (!from || !to) errors.range = "rangeRequired";
  else if (to < from) errors.range = "endBeforeStart";
  else {
    span = daysBetween(from, to) + 1;
    if (span - 1 > MAX_RANGE_DAYS) errors.range = "rangeTooLong";
  }

  const minDays = values.minDays.trim();
  const maxDays = values.maxDays.trim();
  if (!inBounds(minDays)) errors.minDays = "minDaysInvalid";
  else if (!errors.range && Number(minDays) > span) errors.minDays = "minExceedsRange";

  if (maxDays && (!inBounds(maxDays) || (inBounds(minDays) && Number(maxDays) < Number(minDays)))) {
    errors.maxDays = "maxDaysInvalid";
  }

  let deadline: string | null = null;
  if (values.deadline) {
    const instant = new Date(values.deadline);
    if (Number.isNaN(instant.getTime()) || instant <= now) errors.deadline = "deadlinePast";
    else deadline = instant.toISOString();
  }

  const weight = values.maybeWeight.trim() === "" ? Number.NaN : Number(values.maybeWeight);
  if (!(weight >= 0 && weight <= 1)) errors.maybeWeight = "weightInvalid";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      window_start: from,
      window_end: to,
      min_days: Number(minDays),
      max_days: maxDays ? Number(maxDays) : Number(minDays),
      maybe_weight: weight.toFixed(2),
      deadline,
    },
  };
}
