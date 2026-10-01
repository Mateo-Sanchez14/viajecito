"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { useSectionLabel } from "../lib/useSectionLabel";

/** Placeholder for a module that has no page of its own yet. */
export function ComingSoon({ moduleKey }: { moduleKey: string }) {
  const t = useTranslations("trips.comingSoon");
  const sectionLabel = useSectionLabel();

  return (
    <EmptyState
      title={t("title")}
      description={t("description", { section: sectionLabel(moduleKey) })}
    />
  );
}
