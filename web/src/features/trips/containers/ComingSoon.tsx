"use client";

import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { useSectionLabel } from "../lib/useSectionLabel";
import { useTripContext } from "../TripProvider";

/**
 * Placeholder for a module that has no page of its own yet. A segment that is not one of the
 * trip's modules is a 404, so typos and other trip types' sections never render.
 */
export function ComingSoon({ moduleKey }: { moduleKey: string }) {
  const t = useTranslations("trips.comingSoon");
  const sectionLabel = useSectionLabel();
  const { modules } = useTripContext();

  if (!modules.includes(moduleKey)) notFound();

  return (
    <EmptyState
      title={t("title")}
      description={t("description", { section: sectionLabel(moduleKey) })}
    />
  );
}
