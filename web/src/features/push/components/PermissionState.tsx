import type { ReactNode } from "react";

export type PermissionTone = "ok" | "warn" | "neutral";

const TONE: Record<PermissionTone, string> = {
  ok: "border-ok/40 bg-ok-soft text-ok",
  warn: "border-warn/40 bg-warn-soft text-warn",
  neutral: "border-border bg-surface text-foreground",
};

/** Presentational: one line describing the notification state of this device. */
export function PermissionState({ tone, children }: { tone: PermissionTone; children: ReactNode }) {
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${TONE[tone]}`}>
      {children}
    </p>
  );
}
