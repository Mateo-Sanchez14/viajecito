import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/ui/atoms/Skeleton";

export default async function SkiLoading() {
  const t = await getTranslations("ski");

  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label={t("loading")}>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
