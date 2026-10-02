import { useTranslations } from "next-intl";
import type { Task } from "../api/logistics";
export function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("logistics");
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
      <input
        type="checkbox"
        aria-label={task.title}
        checked={task.status === "done"}
        onChange={onToggle}
        disabled={disabled}
        className="h-6 w-6"
      />
      <div className="min-w-0 flex-1">
        <p>{task.title}</p>
        <p className="text-sm text-muted">
          #{task.number} · {t(`task.kind.${task.kind}`)} ·{" "}
          {task.owner?.display_name ?? t("task.noOwner")}
        </p>
        {task.due_on && (
          <p className={task.overdue ? "text-warn" : ""}>
            {task.overdue ? t("task.groups.overdue") : t("due")}: {task.due_on}
          </p>
        )}
        <p className="text-sm">{t(`task.status.${task.status}`)}</p>
      </div>
      <button className="min-h-11 px-2 underline" onClick={onEdit}>
        {t("edit")}
      </button>
      <button
        className="min-h-11 px-2 underline"
        onClick={onDelete}
        disabled={disabled}
      >
        {t("delete")}
      </button>
    </li>
  );
}
