"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import type { OfflineCandidate } from "../api/documents";
import { useOfflineDocument } from "../hooks/useOfflineDocument";

/** One document with its "save for offline" control. */
export function OfflineDocumentRow({ document }: { document: OfflineCandidate }) {
  const t = useTranslations("pwa.offlineDocs");
  const { status, save, remove } = useOfflineDocument(document.id, document.download_path);

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">{document.title}</span>
        {status === "saved" ? (
          <span className="flex items-center gap-3">
            <span className="text-sm font-medium text-ok">{t("saved")}</span>
            <Button variant="link" className="min-h-11" aria-label={`${t("remove")}: ${document.title}`} onClick={() => void remove()}>
              {t("remove")}
            </Button>
          </span>
        ) : status === "unsupported" ? (
          <span className="text-sm text-muted">{t("unsupported")}</span>
        ) : (
          <Button
            className="min-h-11 w-auto"
            disabled={status === "saving" || status === "checking"}
            aria-label={`${t("save")}: ${document.title}`}
            onClick={() => void save()}
          >
            {status === "saving" ? t("saving") : t("save")}
          </Button>
        )}
      </div>
      {status === "error" && (
        <p role="alert" className="text-sm text-warn">
          {t("error")}
        </p>
      )}
    </li>
  );
}
