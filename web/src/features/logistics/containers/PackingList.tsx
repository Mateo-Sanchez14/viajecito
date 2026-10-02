"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyTemplate,
  addPackingEntry,
  deletePackingEntry,
} from "../api/logistics";
import {
  usePacking,
  useUpdatePackingEntry,
  usePackingSummary,
} from "../hooks/queries";
export function PackingList({ tripId }: { tripId: string }) {
  const t = useTranslations("logistics");
  const cache = useQueryClient();
  const packing = usePacking(tripId);
  const update = useUpdatePackingEntry(tripId);
  const [label, setLabel] = useState("");
  const [section, setSection] = useState("custom");
  const [quantity, setQuantity] = useState("");
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["logistics", tripId] });
  const apply = useMutation({
    mutationFn: (key: string) => applyTemplate(tripId, key),
    onSuccess: refresh,
  });
  const add = useMutation({
    mutationFn: () =>
      addPackingEntry(tripId, {
        label: label.trim(),
        section,
        quantity: quantity ? Number(quantity) : null,
      }),
    onSuccess: async () => {
      setLabel("");
      setQuantity("");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: deletePackingEntry,
    onSuccess: refresh,
  });
  return (
    <section className="flex flex-col gap-4">
      {packing.isPending && <p role="status">{t("loading")}</p>}
      {(packing.isError ||
        update.isError ||
        apply.isError ||
        add.isError ||
        remove.isError) && <p role="alert">{t("saveFailed")}</p>}
      {packing.data && (
        <>
          <p role="status">{t("packing.progress", packing.data.progress)}</p>
          <progress
            value={packing.data.progress.packed}
            max={Math.max(1, packing.data.progress.total)}
            aria-label={t("tabs.packing")}
          />
          <div className="flex flex-wrap gap-3">
            {packing.data.templates_available.map((template) => (
              <button
                className="min-h-11 rounded border px-3"
                key={template.key}
                onClick={() => apply.mutate(template.key)}
                disabled={apply.isPending}
              >
                {t("packing.apply", { template: template.label })}
              </button>
            ))}
          </div>
          {!packing.data.sections.length && <p>{t("empty.packing")}</p>}
          {packing.data.sections.map((section) => (
            <section key={section.key}>
              <h2 className="font-semibold">{section.label}</h2>
              <ul>
                {section.entries.map((entry) => (
                  <li
                    className="flex flex-wrap items-center gap-3 py-2"
                    key={entry.id}
                  >
                    <input
                      className="h-6 w-6"
                      type="checkbox"
                      checked={entry.packed}
                      aria-label={entry.label}
                      disabled={update.isPending}
                      onChange={() =>
                        update.mutate({
                          id: entry.id,
                          body: { packed: !entry.packed },
                        })
                      }
                    />
                    <label>
                      <span className="sr-only">{t("packing.item")}</span>
                      <input
                        className="min-h-11 rounded border px-2"
                        aria-label={t("packing.edit", { item: entry.label })}
                        defaultValue={entry.label}
                        key={`${entry.id}:${entry.label}`}
                        maxLength={120}
                        onBlur={(e) => {
                          if (
                            e.target.value.trim() &&
                            e.target.value !== entry.label
                          )
                            update.mutate({
                              id: entry.id,
                              body: { label: e.target.value.trim() },
                            });
                        }}
                      />
                    </label>
                    <label>
                      <span className="sr-only">{t("quantity")}</span>
                      <input
                        key={`${entry.id}:quantity:${entry.quantity}`}
                        type="number"
                        min={1}
                        step={1}
                        aria-label={t("packing.quantity", { item: entry.label })}
                        defaultValue={entry.quantity ?? ""}
                        disabled={update.isPending}
                        className="min-h-11 w-24 rounded border px-2"
                        onBlur={(event) => {
                          if (!event.currentTarget.checkValidity()) return;
                          const value = event.currentTarget.value;
                          const quantity = value === "" ? null : Number(value);
                          if (quantity !== entry.quantity)
                            update.mutate({ id: entry.id, body: { quantity } });
                        }}
                      />
                    </label>
                    <button
                      className="min-h-11 underline"
                      onClick={() => remove.mutate(entry.id)}
                      disabled={remove.isPending}
                    >
                      {t("delete")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label>
          {t("packing.item")}
          <input
            className="block min-h-11 rounded border px-2"
            value={label}
            maxLength={120}
            required
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          {t("quantity")}
          <input
            className="block min-h-11 rounded border px-2"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          {t("packing.section")}
          <input
            className="block min-h-11 rounded border px-2"
            maxLength={32}
            required
            value={section}
            onChange={(e) => setSection(e.target.value)}
          />
        </label>
        <button
          className="min-h-11 rounded border px-3"
          type="submit"
          disabled={add.isPending || !label.trim()}
        >
          {t("packing.add")}
        </button>
      </form>
      <PackingCrewProgress tripId={tripId} />
    </section>
  );
}
export function PackingCrewProgress({ tripId }: { tripId: string }) {
  const t = useTranslations("logistics");
  const { data, isError } = usePackingSummary(tripId);
  return (
    <section>
      <h2 className="font-semibold">{t("packing.crew")}</h2>
      {isError && <p role="alert">{t("loadFailed")}</p>}
      <ul>
        {data?.map((row) => (
          <li key={row.person.person_id}>
            {row.person.display_name}:{" "}
            {t("packing.progress", { packed: row.packed, total: row.total })}
          </li>
        ))}
      </ul>
    </section>
  );
}
