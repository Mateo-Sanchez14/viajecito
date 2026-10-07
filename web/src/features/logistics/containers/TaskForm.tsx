"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTripContext } from "@/features/trips/TripProvider";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { Textarea } from "@/ui/atoms/Textarea";
import { InlineError } from "@/ui/molecules/InlineError";
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
      className="ui-card ui-form bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h3 className="ui-form-title">{task ? t("edit") : t("task.add")}</h3>
      <label className="ui-field">
        {t("task.title")}
        <Input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="ui-field-grid">
        <label className="ui-field">
          {t("task.kindLabel")}
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as TaskCreate["kind"])}
          >
            {(["todo", "bring", "booking"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`task.kind.${v}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="ui-field">
          {t("task.owner")}
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t("task.noOwner")}</option>
            {participants.map((p) => (
              <option key={p.person_id} value={p.person_id}>
                {p.display_name}
              </option>
            ))}
          </Select>
        </label>
        <label className="ui-field">
          {t("due")}
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        {kind === "bring" && (
          <label className="ui-field">
            {t("quantity")}
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        )}
        {task && (
          <label className="ui-field">
            {t("task.statusLabel")}
            <Select
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
            </Select>
          </label>
        )}
      </div>
      <label className="ui-field">
        {t("notes")}
        <Textarea
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {save.isError && <InlineError message={t("saveFailed")} />}
      <div className="ui-form-actions">
        <Button
          type="submit"
          className="ui-button-auto"
          disabled={save.isPending || !title.trim()}
        >
          {t("save")}
        </Button>
        <Button variant="secondary" onClick={onSaved}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
