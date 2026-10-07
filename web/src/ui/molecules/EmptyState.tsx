import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Illustration above the title (decorative; the caller passes an `aria-hidden` svg). */
  art?: ReactNode;
  action?: ReactNode;
};

/** Centered "nothing here yet" tray with an optional illustration, a title and a call to action. */
export function EmptyState({ title, description, icon, art, action }: EmptyStateProps) {
  return (
    <div className="ui-empty-state flex flex-col items-center gap-3 px-6 py-10 text-center">
      {art && <div className="ui-empty-art">{art}</div>}
      {icon && <div className="text-muted">{icon}</div>}
      <p className="ui-empty-title font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
