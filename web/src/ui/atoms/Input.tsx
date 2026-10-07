import type { ComponentProps } from "react";

type InputProps = ComponentProps<"input"> & { invalid?: boolean };

export function Input({ invalid = false, className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`ui-input w-full bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/30 ${className}`}
      {...props}
    />
  );
}
