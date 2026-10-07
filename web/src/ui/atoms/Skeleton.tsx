import type { ComponentProps } from "react";

/** Pulsing placeholder block; size it with utility classes. Decorative only. */
export function Skeleton({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={`ui-skeleton animate-pulse bg-foreground/10 ${className}`}
      {...props}
    />
  );
}
