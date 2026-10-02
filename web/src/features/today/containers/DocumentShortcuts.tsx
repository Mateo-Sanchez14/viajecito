"use client";
import { useTranslations } from "next-intl";
import { documentPath } from "../api/external";
import { useTripDocuments } from "../hooks/external";
const priorities = ["ticket", "reservation", "insurance"];
export function DocumentShortcuts({ tripId }: { tripId: string }) {
  const t = useTranslations("today.documents");
  const { data, isError } = useTripDocuments(tripId);
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {isError && <p role="status">{t("error")}</p>}
      {data && !data.length && <p>{t("empty")}</p>}
      <ul className="space-y-2">
        {data &&
          [...data]
            .sort(
              (a, b) =>
                (priorities.includes(a.kind) ? priorities.indexOf(a.kind) : 3) -
                (priorities.includes(b.kind) ? priorities.indexOf(b.kind) : 3),
            )
            .map((doc) => {
              const path = documentPath(doc.download_path);
              return (
                path && (
                  <li key={doc.id}>
                    <a
                      href={path}
                      className="flex min-h-11 items-center rounded border border-border px-3 break-words"
                    >
                      {doc.title}
                    </a>
                  </li>
                )
              );
            })}
      </ul>
    </section>
  );
}
