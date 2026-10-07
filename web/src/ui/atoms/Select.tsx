import type { ComponentProps } from "react";

type SelectProps = ComponentProps<"select"> & { invalid?: boolean };

export function Select({ invalid = false, className = "", ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`ui-input w-full bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/30 ${className}`}
      {...props}
    />
  );
}
