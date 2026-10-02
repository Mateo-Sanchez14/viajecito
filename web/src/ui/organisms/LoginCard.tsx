import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** Presentational: the framed card that hosts the login steps. */
export function LoginCard({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");

  return (
    <section className="login-card ui-card w-full max-w-md border border-border bg-surface p-7 sm:p-9">
      <div className="login-route" aria-hidden="true">
        <svg viewBox="0 0 300 100" fill="none">
          <path d="M20 76C72 76 66 22 128 22S210 82 280 28" stroke="currentColor" strokeWidth="2" strokeDasharray="4 7" />
          <circle cx="20" cy="76" r="7" fill="currentColor" />
          <circle cx="280" cy="28" r="11" stroke="currentColor" strokeWidth="2" />
          <circle cx="280" cy="28" r="4" fill="currentColor" />
        </svg>
      </div>
      <h1 className="mb-7 text-3xl font-semibold tracking-tight">
        {t("heading")}
      </h1>
      {children}
    </section>
  );
}
