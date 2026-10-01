import type { ManualReportIn } from "../api/ski";

export type ReportField =
  | "base_cm"
  | "new_24h_cm"
  | "temp_c"
  | "lifts_open"
  | "lifts_total"
  | "runs_open"
  | "runs_total";

export type ReportErrorKey = "empty" | "base" | "new24h" | "temp" | "count";
export type ReportInput = Record<ReportField, string> & { status_text: string };

export const EMPTY_REPORT: ReportInput = {
  base_cm: "",
  new_24h_cm: "",
  temp_c: "",
  lifts_open: "",
  lifts_total: "",
  runs_open: "",
  runs_total: "",
  status_text: "",
};

/** Per-field rule and the error key it raises (limits come from the ski contract). */
const RULES: Record<ReportField, { error: ReportErrorKey; valid: (n: number) => boolean }> = {
  base_cm: { error: "base", valid: (n) => Number.isInteger(n) && n >= 0 && n <= 1000 },
  new_24h_cm: { error: "new24h", valid: (n) => Number.isInteger(n) && n >= 0 && n <= 300 },
  temp_c: { error: "temp", valid: (n) => n >= -40 && n <= 30 },
  lifts_open: { error: "count", valid: (n) => Number.isInteger(n) && n >= 0 },
  lifts_total: { error: "count", valid: (n) => Number.isInteger(n) && n >= 0 },
  runs_open: { error: "count", valid: (n) => Number.isInteger(n) && n >= 0 },
  runs_total: { error: "count", valid: (n) => Number.isInteger(n) && n >= 0 },
};

export type ReportValidation =
  | { ok: true; body: ManualReportIn }
  | { ok: false; errors: Partial<Record<ReportField, ReportErrorKey>>; form?: ReportErrorKey };

/** Validates a manual report; only the filled fields end up in the body (at least one is required). */
export function validateReport(input: ReportInput): ReportValidation {
  const errors: Partial<Record<ReportField, ReportErrorKey>> = {};
  const body: ManualReportIn = {};

  for (const field of Object.keys(RULES) as ReportField[]) {
    const raw = input[field].trim();
    if (raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || !RULES[field].valid(value)) errors[field] = RULES[field].error;
    else body[field] = value;
  }
  const status = input.status_text.trim();
  if (status) body.status_text = status;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(body).length === 0) return { ok: false, errors: {}, form: "empty" };
  return { ok: true, body };
}
