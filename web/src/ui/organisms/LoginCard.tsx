import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** Presentational: the framed card that hosts the login steps. */
export function LoginCard({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");

  return (
    <section className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t("heading")}
      </h1>
      {children}
    </section>
  );
}
