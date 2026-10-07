import type { ComponentProps, ElementType } from "react";

type CardProps = ComponentProps<"div"> & { as?: ElementType };

/** Surface container: radius, border and elevation come from the globals.css tokens (`.ui-card`). */
export function Card({ as: Tag = "div", className = "", ...props }: CardProps) {
  return (
    <Tag
      className={`ui-card bg-surface p-5 ${className}`}
      {...props}
    />
  );
}
