"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTripContext } from "@/features/trips/TripProvider";
import { Button } from "@/ui/atoms/Button";
import { Select } from "@/ui/atoms/Select";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { PlusIcon } from "@/ui/icons";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { InlineError } from "@/ui/molecules/InlineError";
import { deleteTask, type Task } from "../api/logistics";
import { useTasks, useUpdateTask } from "../hooks/queries";
import { TaskRow } from "../components/TaskRow";
import { TaskForm } from "./TaskForm";

function localDay(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function TaskList({ tripId }: { tripId: string }) {
  const t = useTranslations("logistics");
  const ui = useTranslations("ui");
  const { trip } = useTripContext();
  const cache = useQueryClient();
  const [owner, setOwner] = useState("");
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Task | null | undefined>();
  const tasks = useTasks(tripId, {
    owner: owner || undefined,
    kind: kind || undefined,
  });
  const update = useUpdateTask(tripId);
  const remove = useMutation({
    mutationFn: deleteTask,
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["logistics", tripId] }),
  });
  const today = localDay(trip.timezone);
  const week = new Date(`${today}T12:00:00Z`);
  week.setUTCDate(week.getUTCDate() + 7);
  const end = week.toISOString().slice(0, 10);
  const groups: Record<string, Task[]> = {
    overdue: [],
    week: [],
    later: [],
    noDate: [],
    done: [],
  };
  for (const task of tasks.data ?? []) {
    const key =
      task.status === "done"
        ? "done"
        : task.overdue
          ? "overdue"
          : !task.due_on
            ? "noDate"
            : task.due_on <= end
              ? "week"
              : "later";
    groups[key].push(task);
  }
  return (
    <section className="ui-stack">
      <div className="logistics-toolbar">
        <label className="ui-field">
          {t("filter.label")}
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t("filter.all")}</option>
            <option value="me">{t("filter.mine")}</option>
          </Select>
        </label>
        <label className="ui-field">
          {t("task.kindLabel")}
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("filter.all")}</option>
            {(["todo", "bring", "booking"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`task.kind.${v}`)}
              </option>
            ))}
          </Select>
        </label>
        <Button className="ui-button-auto" onClick={() => setEditing(null)}>
          <PlusIcon size={18} aria-hidden="true" />
          {t("task.add")}
        </Button>
      </div>
      {editing !== undefined && (
        <TaskForm
          key={editing?.id ?? "new"}
          tripId={tripId}
          task={editing ?? undefined}
          onSaved={() => setEditing(undefined)}
        />
      )}
      {tasks.isPending && (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-2">
          <Skeleton className="loading-row" />
          <Skeleton className="loading-row" />
          <Skeleton className="loading-row" />
        </div>
      )}
      {tasks.isError && (
        <InlineError
          message={t("loadFailed")}
          retryLabel={ui("retry")}
          onRetry={() => void tasks.refetch()}
        />
      )}
      {(update.isError || remove.isError) && (
        <InlineError message={t("saveFailed")} />
      )}
      {tasks.data?.length === 0 && (
        <EmptyState
          art={<EmptyArt scene="suitcase" />}
          title={t("empty.tasks")}
          description={t("empty.tasksBody")}
          action={
            <Button
              variant="secondary"
              className="ui-button-auto"
              onClick={() => setEditing(null)}
            >
              {t("empty.tasksCta")}
            </Button>
          }
        />
      )}
      {Object.entries(groups)
        .filter(([, items]) => items.length)
        .map(([key, items]) => (
          <section key={key}>
            <h3 className="ui-group-title">{t(`task.groups.${key}`)}</h3>
            <ul className="ui-list">
              {items.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() =>
                    update.mutate({
                      id: task.id,
                      body: {
                        status: task.status === "done" ? "open" : "done",
                      },
                    })
                  }
                  onEdit={() => setEditing(task)}
                  onDelete={() => remove.mutate(task.id)}
                  disabled={update.isPending || remove.isPending}
                />
              ))}
            </ul>
          </section>
        ))}
    </section>
  );
}
