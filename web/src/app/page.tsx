import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("app");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{t("name")}</h1>
      <p className="text-lg text-muted">{t("tagline")}</p>
    </main>
  );
}
