import { getTranslations } from "next-intl/server";
import { OfflineBanner } from "@/features/pwa/containers/OfflineBanner";

/** Precached fallback for page navigations that fail offline. Public: no session needed. */
export default async function OfflinePage() {
  const t = await getTranslations("pwa.offline.page");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <OfflineBanner always />
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
    </main>
  );
}
