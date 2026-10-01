import { useTranslations } from "next-intl";
import type { PersonRef } from "../api/dates";

/** Presentational: who has not marked a single day yet. */
export function NonResponders({ people }: { people: PersonRef[] }) {
  const t = useTranslations("dates.missing");
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {people.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <ul aria-label={t("title")} className="flex flex-wrap gap-2">
          {people.map((person) => (
            <li key={person.person_id} className="rounded-full border border-border bg-surface px-3 py-1 text-sm">
              {person.display_name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
