"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/ui/atoms/Select";
import {
  CATEGORIES,
  DEFAULT_FILTERS,
  STATUSES,
  type Category,
  type ProposalFilters as Filters,
  type ProposalStatus,
  type SortOrder,
} from "../api/proposals";

/** Discarded proposals are controlled by their own switch, not by a status chip. */
const STATUS_CHIPS = STATUSES.filter((status) => status !== "discarded");

type ProposalFiltersProps = {
  filters: Filters;
  onChange: (next: Filters) => void;
};

export function isFiltering(filters: Filters): boolean {
  return (
    filters.categories.length > 0 ||
    filters.statuses.length > 0 ||
    filters.includeDiscarded !== DEFAULT_FILTERS.includeDiscarded
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Chip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
        pressed ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/** Category and status chips, the discarded switch and the sort order. Fully controlled. */
export function ProposalFilters({ filters, onChange }: ProposalFiltersProps) {
  const t = useTranslations("proposals");
  const id = useId();

  return (
    <section aria-label={t("filters.label")} className="flex flex-col gap-3">
      <div role="group" aria-label={t("filters.category")} className="flex flex-wrap gap-2">
        {CATEGORIES.map((category: Category) => (
          <Chip
            key={category}
            label={t(`category.${category}`)}
            pressed={filters.categories.includes(category)}
            onClick={() => onChange({ ...filters, categories: toggle(filters.categories, category) })}
          />
        ))}
      </div>
      <div role="group" aria-label={t("filters.status")} className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((status: ProposalStatus) => (
          <Chip
            key={status}
            label={t(`status.${status}`)}
            pressed={filters.statuses.includes(status)}
            onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, status) })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeDiscarded}
            onChange={(e) => onChange({ ...filters, includeDiscarded: e.target.checked })}
            className="size-5"
          />
          {t("filters.showDiscarded")}
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-sort`} className="text-sm font-medium">
            {t("filters.sort")}
          </label>
          <Select
            id={`${id}-sort`}
            value={filters.sort}
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortOrder })}
            className="w-auto"
          >
            <option value="recent">{t("sort.recent")}</option>
            <option value="score">{t("sort.score")}</option>
          </Select>
        </div>
      </div>
    </section>
  );
}
