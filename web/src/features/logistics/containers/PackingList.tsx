"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Input } from "@/ui/atoms/Input";
import { ProgressBar } from "@/ui/atoms/ProgressBar";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { PlusIcon, TrashIcon } from "@/ui/icons";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { InlineError } from "@/ui/molecules/InlineError";
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
  const ui = useTranslations("ui");
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
    <section className="ui-stack">
      {packing.isPending && (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-2">
          <Skeleton className="loading-hero" />
          <Skeleton className="loading-row" />
          <Skeleton className="loading-row" />
        </div>
      )}
      {packing.isError && (
        <InlineError
          message={t("loadFailed")}
          retryLabel={ui("retry")}
          onRetry={() => void packing.refetch()}
        />
      )}
      {(update.isError || apply.isError || add.isError || remove.isError) && (
        <InlineError message={t("saveFailed")} />
      )}
      {packing.data && (
        <>
          <Card className="packing-summary">
            <p role="status" className="packing-progress ui-tabular">
              {t("packing.progress", packing.data.progress)}
            </p>
            <ProgressBar
              value={
                packing.data.progress.total > 0
                  ? packing.data.progress.packed / packing.data.progress.total
                  : 0
              }
              label={t("tabs.packing")}
            />
            {packing.data.templates_available.length > 0 && (
              <div className="ui-form-actions">
                {packing.data.templates_available.map((template) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    key={template.key}
                    onClick={() => apply.mutate(template.key)}
                    disabled={apply.isPending}
                  >
                    {t("packing.apply", { template: template.label })}
                  </Button>
                ))}
              </div>
            )}
          </Card>
          {!packing.data.sections.length && (
            <EmptyState
              art={<EmptyArt scene="suitcase" />}
              title={t("empty.packing")}
            />
          )}
          {packing.data.sections.map((section) => (
            <section key={section.key}>
              <h3 className="ui-group-title">{section.label}</h3>
              <ul className="ui-list">
                {section.entries.map((entry) => (
                  <li className="ui-row packing-row" key={entry.id}>
                    <label className="ui-check">
                      <input
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
                    </label>
                    <Input
                      className="packing-label"
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
                    <Input
                      key={`${entry.id}:quantity:${entry.quantity}`}
                      type="number"
                      min={1}
                      max={32767}
                      step={1}
                      aria-label={t("packing.quantity", { item: entry.label })}
                      defaultValue={entry.quantity ?? ""}
                      disabled={update.isPending}
                      className="packing-quantity"
                      onBlur={(event) => {
                        if (!event.currentTarget.checkValidity()) return;
                        const value = event.currentTarget.value;
                        const quantity = value === "" ? null : Number(value);
                        if (quantity !== entry.quantity)
                          update.mutate({ id: entry.id, body: { quantity } });
                      }}
                    />
                    <Button
                      variant="icon"
                      aria-label={t("packing.deleteNamed", { item: entry.label })}
                      onClick={() => remove.mutate(entry.id)}
                      disabled={remove.isPending}
                    >
                      <TrashIcon size={20} aria-hidden="true" />
                    </Button>
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
        className="ui-card ui-form bg-surface p-5"
      >
        <h3 className="ui-form-title">{t("packing.add")}</h3>
        <div className="ui-field-grid">
          <label className="ui-field">
            {t("packing.item")}
            <Input
              value={label}
              maxLength={120}
              required
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="ui-field">
            {t("quantity")}
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="ui-field">
            {t("packing.section")}
            <Input
              maxLength={32}
              required
              value={section}
              onChange={(e) => setSection(e.target.value)}
            />
          </label>
        </div>
        <div className="ui-form-actions">
          <Button
            type="submit"
            className="ui-button-auto"
            disabled={add.isPending || !label.trim()}
          >
            <PlusIcon size={18} aria-hidden="true" />
            {t("packing.add")}
          </Button>
        </div>
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
      <h3 className="ui-group-title">{t("packing.crew")}</h3>
      {isError && <InlineError message={t("loadFailed")} />}
      <ul className="ui-list">
        {data?.map((row) => (
          <li className="ui-row crew-packing-row" key={row.person.person_id}>
            <span className="ui-row-title">{row.person.display_name}</span>
            <ProgressBar
              value={row.total > 0 ? row.packed / row.total : 0}
              label={row.person.display_name}
            />
            <span className="ui-row-meta ui-tabular">
              {t("packing.progress", { packed: row.packed, total: row.total })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
