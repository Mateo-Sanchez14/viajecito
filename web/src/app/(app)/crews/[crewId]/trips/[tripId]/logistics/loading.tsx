import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/ui/atoms/Skeleton";
export default async function Loading() {
  const t = await getTranslations("logistics");
  return (
    <section aria-busy="true">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Skeleton className="h-40" />
    </section>
  );
}
