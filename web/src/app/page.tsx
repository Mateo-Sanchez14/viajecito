import { getTranslations } from "next-intl/server";
import { HealthStatus } from "@/features/ops/containers/HealthStatus";

export default async function Home() {
  const t = await getTranslations("app");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">{t("name")}</h1>
        <p className="text-lg text-muted">{t("tagline")}</p>
      </div>
      <HealthStatus />
    </main>
  );
}
