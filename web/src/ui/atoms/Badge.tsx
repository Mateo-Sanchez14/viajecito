import type { ReactNode } from "react";

export type BadgeVariant = "ok" | "degraded" | "neutral";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  ok: "bg-ok-soft text-ok border-transparent",
  degraded: "bg-warn-soft text-warn border-transparent",
  neutral: "bg-surface text-muted border-border",
};

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
