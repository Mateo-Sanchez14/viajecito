"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTripContext } from "@/features/trips/TripProvider";
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <label>
          {t("filter.label")}
          <select
            className="block min-h-11"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">{t("filter.all")}</option>
            <option value="me">{t("filter.mine")}</option>
          </select>
        </label>
        <label>
          {t("task.kindLabel")}
          <select
            className="block min-h-11"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">{t("filter.all")}</option>
            {(["todo", "bring", "booking"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`task.kind.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 rounded border px-3"
          onClick={() => setEditing(null)}
        >
          {t("task.add")}
        </button>
      </div>
      {editing !== undefined && (
        <TaskForm
          key={editing?.id ?? "new"}
          tripId={tripId}
          task={editing ?? undefined}
          onSaved={() => setEditing(undefined)}
        />
      )}
      {tasks.isPending && <p role="status">{t("loading")}</p>}
      {(tasks.isError || update.isError || remove.isError) && (
        <p role="alert">{t("saveFailed")}</p>
      )}
      {tasks.data?.length === 0 && <p>{t("empty.tasks")}</p>}
      {Object.entries(groups)
        .filter(([, items]) => items.length)
        .map(([key, items]) => (
          <section key={key}>
            <h2 className="mb-2 font-semibold">{t(`task.groups.${key}`)}</h2>
            <ul className="flex flex-col gap-2">
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
