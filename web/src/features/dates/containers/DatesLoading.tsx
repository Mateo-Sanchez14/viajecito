"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/ui/atoms/Skeleton";

/** Placeholder while the decisions load (also the route's `loading.tsx`). */
export function DatesLoading() {
  const t = useTranslations("dates");
  return (
    <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </div>
  );
}
