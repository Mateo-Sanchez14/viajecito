import type { ComponentProps } from "react";

type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export function Textarea({ invalid = false, className = "", ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      rows={4}
      className={`w-full rounded-xl border bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/30 ${
        invalid ? "border-warn" : "border-border"
      } ${className}`}
      {...props}
    />
  );
}
