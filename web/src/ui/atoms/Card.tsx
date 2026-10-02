import type { ComponentProps, ElementType } from "react";

type CardProps = ComponentProps<"div"> & { as?: ElementType };

/** Surface container: rounded, bordered, themed through the globals.css tokens. */
export function Card({ as: Tag = "div", className = "", ...props }: CardProps) {
  return (
    <Tag
      className={`ui-card rounded-2xl border border-border bg-surface p-5 ${className}`}
      {...props}
    />
  );
}
