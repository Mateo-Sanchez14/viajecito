import type { CSSProperties } from "react";

type ProgressBarProps = {
  /** Completed fraction from 0 to 1. Anything else (NaN, negative, above 1) is clamped. */
  value: number;
  /** Accessible name of the meter. */
  label: string;
  className?: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Thin progress meter. Never produces NaN, whatever the caller computed. */
export function ProgressBar({ value, label, className = "" }: ProgressBarProps) {
  const fraction = clamp01(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className={`ui-progress ${className}`}
    >
      <span className="ui-progress-fill" style={{ "--progress": fraction } as CSSProperties} />
    </div>
  );
}
