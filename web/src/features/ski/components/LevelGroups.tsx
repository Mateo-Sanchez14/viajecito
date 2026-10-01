import { useTranslations } from "next-intl";
import type { LevelGroup } from "../api/ski";

/** Presentational: who rides with whom, grouped by discipline and level. */
export function LevelGroups({ groups }: { groups: LevelGroup[] }) {
  const t = useTranslations("ski");

  if (groups.length === 0) return <p className="text-sm text-muted">{t("levels.empty")}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => (
        <li key={`${group.discipline}-${group.level}`} className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-sm font-semibold">
            {t("levels.group", {
              discipline: t(`profile.disciplines.${group.discipline}`),
              level: t(`profile.levels.${group.level}`),
            })}
          </span>
          <span className="text-sm text-muted">
            {group.people.map((person) => person.display_name).join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
