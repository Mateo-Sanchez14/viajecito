"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDocuments } from "../hooks/useDocuments";
import {
  deleteDocument,
  downloadPath,
  updateDocument,
  type Document,
} from "../api/documents";
import { UploadDocumentForm, documentKinds } from "./UploadDocumentForm";
function DocumentEditor({
  document,
  tripId,
  onClose,
  viewerId,
}: {
  document: Document;
  tripId: string;
  onClose: () => void;
  viewerId?: string;
}) {
  const t = useTranslations("documents");
  const cache = useQueryClient();
  const [title, setTitle] = useState(document.title);
  const [expiry, setExpiry] = useState(document.valid_until ?? "");
  const [visibility, setVisibility] = useState(document.visibility);
  const save = useMutation({
    mutationFn: () =>
      updateDocument(document.id, {
        title,
        valid_until: expiry || null,
        ...(viewerId === document.owner?.person_id &&
        visibility !== document.visibility
          ? { visibility }
          : {}),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["documents", tripId] });
      onClose();
    },
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        {t("name")}
        <input
          className="block min-h-11 rounded border p-2"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        {t("expiry")}
        <input
          className="block min-h-11"
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
      </label>
      {viewerId === document.owner?.person_id && (
        <label>
          {t("visibilityLabel")}
          <select
            className="block min-h-11"
            value={visibility}
            disabled={document.kind === "id"}
            onChange={(e) =>
              setVisibility(e.target.value as Document["visibility"])
            }
          >
            <option value="crew">{t("visibility.crew")}</option>
            <option value="owner_only">{t("visibility.owner_only")}</option>
          </select>
        </label>
      )}
      {save.isError && <p role="alert">{t("errors.invalid_request")}</p>}
      <button
        className="min-h-11 underline"
        disabled={save.isPending}
        type="submit"
      >
        {t("save")}
      </button>
      <button className="min-h-11" type="button" onClick={onClose}>
        {t("cancel")}
      </button>
    </form>
  );
}
export function DocumentVault({
  tripId,
  viewerId,
}: {
  tripId: string;
  viewerId?: string;
}) {
  const t = useTranslations("documents");
  const cache = useQueryClient();
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const documents = useDocuments(tripId, kind || undefined);
  const remove = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["documents", tripId] }),
  });
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <label>
        {t("filter")}
        <select
          className="block min-h-11"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">{t("all")}</option>
          {documentKinds.map((value) => (
            <option key={value} value={value}>
              {t(`kind.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <UploadDocumentForm tripId={tripId} />
      {documents.isPending && <p role="status">{t("loading")}</p>}
      {(documents.isError || remove.isError) && (
        <p role="alert">{t("errors.invalid_request")}</p>
      )}
      {documents.data?.length === 0 && <p>{t("empty")}</p>}
      {documentKinds.map((category) => {
        const rows =
          documents.data?.filter((document) => document.kind === category) ??
          [];
        return (
          rows.length > 0 && (
            <section key={category}>
              <h2 className="font-semibold">{t(`kind.${category}`)}</h2>
              <ul>
                {rows.map((document) => {
                  const path = downloadPath(document.download_path);
                  return (
                    <li
                      className="flex flex-col gap-2 rounded border p-3"
                      key={document.id}
                    >
                      <h3>{document.title}</h3>
                      <p>
                        {Math.ceil(document.size / 1024)} KB ·{" "}
                        {t(`visibility.${document.visibility}`)}
                      </p>
                      {document.valid_until && (
                        <p>{t("validUntil", { date: document.valid_until })}</p>
                      )}
                      {path && (
                        <div className="flex gap-4">
                          <a
                            className="min-h-11 underline"
                            href={path}
                            aria-label={t("downloadNamed", {
                              title: document.title,
                            })}
                          >
                            {t("download")}
                          </a>
                          {(document.mime === "application/pdf" ||
                            document.mime.startsWith("image/")) && (
                            <a
                              className="min-h-11 underline"
                              href={`${path}?inline=true`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("view")}
                            </a>
                          )}
                        </div>
                      )}
                      <button
                        className="min-h-11 underline"
                        onClick={() => setEditing(document.id)}
                      >
                        {t("edit")}
                      </button>
                      {document.can_delete && (
                        <button
                          className="min-h-11 underline"
                          onClick={() => remove.mutate(document.id)}
                          disabled={remove.isPending}
                        >
                          {t("delete")}
                        </button>
                      )}
                      {editing === document.id && (
                        <DocumentEditor
                          viewerId={viewerId}
                          document={document}
                          tripId={tripId}
                          onClose={() => setEditing(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        );
      })}
    </div>
  );
}
