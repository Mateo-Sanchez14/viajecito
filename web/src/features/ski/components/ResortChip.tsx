import type { ReactNode } from "react";

type ResortChipProps = {
  name: string;
  detail?: string;
  action?: ReactNode;
};

/** Presentational: a resort row with its detail line and an action slot (add / remove). */
export function ResortChip({ name, detail, action }: ResortChipProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        {detail && <span className="truncate text-sm text-muted">{detail}</span>}
      </span>
      {action}
    </li>
  );
}
