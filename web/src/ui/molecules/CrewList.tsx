import { useTranslations } from "next-intl";
import type { components } from "@/shared/api/schema";
import { Badge } from "@/ui/atoms/Badge";

type Crew = components["schemas"]["CrewSummaryOut"];

/** Presentational: the person's crews with a role badge, or an empty state. */
export function CrewList({ crews }: { crews: Crew[] }) {
  const t = useTranslations("home.crews");

  if (crews.length === 0) {
    return <p className="text-sm text-muted">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {crews.map((crew) => (
        <li
          key={crew.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <span className="font-medium">{crew.name}</span>
          <Badge variant={crew.role === "admin" ? "ok" : "neutral"}>
            {t(`role.${crew.role}`)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
