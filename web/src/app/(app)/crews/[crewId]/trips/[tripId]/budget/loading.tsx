import { getTranslations } from "next-intl/server";
import { ListSkeleton } from "@/ui/molecules/ListSkeleton";
export default async function Loading() {
  const t = await getTranslations("budget");
  return (
    <section aria-busy="true" className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <ListSkeleton />
    </section>
  );
}
