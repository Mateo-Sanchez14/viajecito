import type { ReactNode } from "react";
export function DayColumn({
  label,
  header,
  children,
}: {
  label: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      {header}
      <ol aria-label={label} className="space-y-2">
        {children}
      </ol>
    </section>
  );
}
