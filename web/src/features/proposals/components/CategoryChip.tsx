"use client";

import { useTranslations } from "next-intl";
import type { Category } from "../api/proposals";

export function CategoryChip({ category }: { category: Category }) {
  const t = useTranslations("proposals.category");
  return (
    <span className="inline-flex items-center rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-medium">
      {t(category)}
    </span>
  );
}
