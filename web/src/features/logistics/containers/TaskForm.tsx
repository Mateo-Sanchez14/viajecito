"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTripContext } from "@/features/trips/TripProvider";
import {
  createTask,
  updateTask,
  type Task,
  type TaskCreate,
} from "../api/logistics";
export function TaskForm({
  tripId,
  task,
  onSaved,
}: {
  tripId: string;
  task?: Task;
  onSaved: () => void;
}) {
  const t = useTranslations("logistics");
  const { participants } = useTripContext();
  const cache = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? "");
  const [kind, setKind] = useState<TaskCreate["kind"]>(task?.kind ?? "todo");
  const [owner, setOwner] = useState(task?.owner?.person_id ?? "");
  const [due, setDue] = useState(task?.due_on ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [quantity, setQuantity] = useState(task?.quantity?.toString() ?? "");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "open");
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        kind,
        owner_id: owner || null,
        due_on: due || null,
        notes,
        quantity: quantity ? Number(quantity) : null,
      };
      return task
        ? updateTask(task.id, { ...body, status })
        : createTask(tripId, body);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["logistics", tripId] });
      onSaved();
    },
  });
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2>{task ? t("edit") : t("task.add")}</h2>
      <label>
        {t("task.title")}
        <input
          className="block w-full rounded border p-2"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        {t("task.kindLabel")}
        <select
          className="block min-h-11"
          value={kind}
          onChange={(e) => setKind(e.target.value as TaskCreate["kind"])}
        >
          {(["todo", "bring", "booking"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`task.kind.${v}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("task.owner")}
        <select
          className="block min-h-11"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">{t("task.noOwner")}</option>
          {participants.map((p) => (
            <option key={p.person_id} value={p.person_id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("due")}
        <input
          className="block min-h-11"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <label>
        {t("notes")}
        <textarea
          className="block w-full rounded border p-2"
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {kind === "bring" && (
        <label>
          {t("quantity")}
          <input
            type="number"
            min={1}
            className="block min-h-11"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
      )}
      {task && (
        <label>
          {t("task.statusLabel")}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Task["status"])}
          >
            {(["open", "blocked", "done"] as const)
              .filter((value) => task.status !== "done" || value !== "blocked")
              .map((value) => (
                <option key={value} value={value}>
                  {t(`task.status.${value}`)}
                </option>
              ))}
          </select>
        </label>
      )}
      {save.isError && <p role="alert">{t("saveFailed")}</p>}
      <button
        className="min-h-11 rounded bg-foreground px-4 text-background"
        type="submit"
        disabled={save.isPending || !title.trim()}
      >
        {t("save")}
      </button>
      <button className="min-h-11" onClick={onSaved} type="button">
        {t("cancel")}
      </button>
    </form>
  );
}
