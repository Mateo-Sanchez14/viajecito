import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/ui/atoms/Badge";
import { Button } from "@/ui/atoms/Button";
import { CalendarBlankIcon, PencilSimpleIcon, TrashIcon, WarningCircleIcon } from "@/ui/icons";
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
  const format = useFormatter();
  const done = task.status === "done";
  const due = task.due_on
    ? format.dateTime(new Date(`${task.due_on}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
    : null;
  return (
    <li className="ui-row task-row">
      <label className="ui-check">
        <input
          type="checkbox"
          aria-label={task.title}
          checked={done}
          onChange={onToggle}
          disabled={disabled}
        />
      </label>
      <div className="ui-row-main">
        <p className={`ui-row-title ${done ? "task-done" : ""}`}>{task.title}</p>
        <p className="ui-row-meta">
          #{task.number} · {t(`task.kind.${task.kind}`)} ·{" "}
          {task.owner?.display_name ?? t("task.noOwner")}
        </p>
        {(due || task.status === "blocked" || done) && (
          <div className="task-badges">
            {due && !done && (
              <Badge
                variant={task.overdue ? "degraded" : "neutral"}
                icon={
                  task.overdue ? (
                    <WarningCircleIcon size={14} aria-hidden="true" />
                  ) : (
                    <CalendarBlankIcon size={14} aria-hidden="true" />
                  )
                }
              >
                {t(task.overdue ? "task.overdueOn" : "task.dueOn", { date: due })}
              </Badge>
            )}
            {task.status === "blocked" && (
              <Badge variant="degraded">{t("task.status.blocked")}</Badge>
            )}
            {done && <Badge variant="ok">{t("task.status.done")}</Badge>}
          </div>
        )}
      </div>
      <div className="ui-row-actions">
        <Button
          variant="icon"
          aria-label={t("task.editNamed", { title: task.title })}
          onClick={onEdit}
        >
          <PencilSimpleIcon size={20} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          aria-label={t("task.deleteNamed", { title: task.title })}
          onClick={onDelete}
          disabled={disabled}
        >
          <TrashIcon size={20} aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
