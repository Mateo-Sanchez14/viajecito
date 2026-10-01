"use client";

import { useTranslations } from "next-intl";
import { ErrorBoundary } from "@/shared/lib/ErrorBoundary";
import { HealthBadge } from "@/ui/molecules/HealthBadge";
import { useHealth } from "../hooks/useHealth";

function HealthContent() {
  const t = useTranslations("ops.health");
  const { data, isPending, isError } = useHealth();

  return (
    <>
      {isPending && <p className="text-sm text-muted">{t("loading")}</p>}
      {isError && <p className="text-sm text-warn">{t("error")}</p>}
      {data && (
        <HealthBadge
          status={data.status}
          checks={data.checks}
          version={data.version}
        />
      )}
    </>
  );
}

/** Container: fetches the api health and delegates rendering to HealthBadge. */
export function HealthStatus() {
  const t = useTranslations("ops.health");

  return (
    <section
      aria-label={t("title")}
      role="status"
      aria-live="polite"
      className="w-full rounded-2xl border border-border bg-surface p-5"
    >
      <ErrorBoundary
        fallback={<p className="text-sm text-warn">{t("error")}</p>}
      >
        <HealthContent />
      </ErrorBoundary>
    </section>
  );
}
