import type { ReactNode } from "react";
export function TrayList({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-dashed border-border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {help && <p className="text-sm text-muted">{help}</p>}
      <ul aria-label={title} className="space-y-2">
        {children}
      </ul>
    </section>
  );
}
