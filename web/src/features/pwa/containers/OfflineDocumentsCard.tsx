"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import { documentKeys, listOfflineCandidates } from "../api/documents";
import { OfflineDocumentRow } from "./OfflineDocumentRow";

/** Overview card for the documents module: choose which files to keep available without signal. */
export function OfflineDocumentsCard({ tripId }: { tripId: string; crewId: string }) {
  const t = useTranslations("pwa.offlineDocs");
  const { data, isError, isPending } = useQuery({
    queryKey: documentKeys.list(tripId),
    queryFn: () => listOfflineCandidates(tripId),
  });

  return (
    <Card as="section" aria-label={t("title")} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {isError ? (
        <p role="alert" className="text-sm text-warn">
          {t("loadError")}
        </p>
      ) : isPending ? null : data.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((document) => (
            <OfflineDocumentRow key={document.id} document={document} />
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">{t("sharedDevice")}</p>
    </Card>
  );
}
