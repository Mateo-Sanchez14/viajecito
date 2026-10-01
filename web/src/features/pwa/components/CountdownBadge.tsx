import { Card } from "@/ui/atoms/Card";

/** Presentational: a headline for the trip countdown. */
export function CountdownBadge({ title, label }: { title: string; label: string }) {
  return (
    <Card as="section" aria-label={title} className="flex flex-col gap-1">
      <p className="text-sm text-muted">{title}</p>
      <p className="text-2xl font-semibold tracking-tight">{label}</p>
    </Card>
  );
}
