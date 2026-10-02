import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

/** Centered "nothing here yet" block with an optional icon and call to action. */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="ui-empty-state flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
