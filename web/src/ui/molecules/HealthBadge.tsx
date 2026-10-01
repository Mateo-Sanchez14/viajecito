import { useTranslations } from "next-intl";
import type { components } from "@/shared/api/schema";
import { Badge } from "@/ui/atoms/Badge";

type Health = components["schemas"]["HealthOut"];

type HealthBadgeProps = {
  status: Health["status"];
  checks: Health["checks"];
  version: Health["version"];
};

/** Presentational: renders an already-fetched health payload. */
export function HealthBadge({ status, checks, version }: HealthBadgeProps) {
  const t = useTranslations("ops.health");

  return (
    <div className="flex flex-col items-center gap-3">
      <Badge variant={status === "ok" ? "ok" : "degraded"}>{t(status)}</Badge>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted">
        {(Object.keys(checks) as Array<keyof Health["checks"]>).map((name) => (
          <li key={name}>
            {t(`checks.${name}`)}: {t(`check.${checks[name]}`)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("version", { version })}</p>
    </div>
  );
}
