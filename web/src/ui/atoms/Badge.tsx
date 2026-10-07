import type { ReactNode } from "react";

export type BadgeVariant = "ok" | "degraded" | "neutral" | "accent";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  ok: "bg-ok-soft text-ok border-transparent",
  degraded: "bg-warn-soft text-warn border-transparent",
  neutral: "bg-surface text-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
};

type BadgeProps = {
  variant: BadgeVariant;
  /** Optional leading icon; the caller marks it `aria-hidden`. */
  icon?: ReactNode;
  children: ReactNode;
};

export function Badge({ variant, icon, children }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={`ui-badge inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {icon}
      {children}
    </span>
  );
}
