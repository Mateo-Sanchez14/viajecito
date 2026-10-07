"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/ui/atoms/Button";
import { ButtonLink } from "@/ui/atoms/ButtonLink";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { Skeleton } from "@/ui/atoms/Skeleton";
import {
  BedIcon,
  FileTextIcon,
  IdentificationCardIcon,
  ImageIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  TicketIcon,
  TrashIcon,
} from "@/ui/icons";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { InlineError } from "@/ui/molecules/InlineError";
import { useDocuments } from "../hooks/useDocuments";
import {
  deleteDocument,
  downloadPath,
  updateDocument,
  type Document,
} from "../api/documents";
import {
  DOCUMENT_FILE_INPUT_ID,
  UploadDocumentForm,
  documentKinds,
} from "./UploadDocumentForm";

const KIND_ICON = {
  reservation: BedIcon,
  ticket: TicketIcon,
  insurance: ShieldCheckIcon,
  id: IdentificationCardIcon,
  photo: ImageIcon,
  other: FileTextIcon,
} satisfies Record<Document["kind"], typeof FileTextIcon>;

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
      className="ui-form document-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="ui-field-grid">
        <label className="ui-field">
          {t("name")}
          <Input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ui-field">
          {t("expiry")}
          <Input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>
        {viewerId === document.owner?.person_id && (
          <label className="ui-field">
            {t("visibilityLabel")}
            <Select
              value={visibility}
              disabled={document.kind === "id"}
              onChange={(e) =>
                setVisibility(e.target.value as Document["visibility"])
              }
            >
              <option value="crew">{t("visibility.crew")}</option>
              <option value="owner_only">{t("visibility.owner_only")}</option>
            </Select>
          </label>
        )}
      </div>
      {save.isError && <InlineError message={t("errors.invalid_request")} />}
      <div className="ui-form-actions">
        <Button type="submit" className="ui-button-auto" size="sm" disabled={save.isPending}>
          {t("save")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** Shaped like the loaded view: the upload card, then rows. */
function VaultSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="loading-row" />
      <Skeleton className="loading-row" />
      <Skeleton className="loading-row" />
    </div>
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
  const ui = useTranslations("ui");
  const format = useFormatter();
  const cache = useQueryClient();
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const documents = useDocuments(tripId, kind || undefined);
  const remove = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["documents", tripId] }),
  });
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      dateStyle: "medium",
      timeZone: "UTC",
    });
  return (
    <div className="ui-stack">
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <UploadDocumentForm tripId={tripId} />
      <label className="ui-field">
        {t("filter")}
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t("all")}</option>
          {documentKinds.map((value) => (
            <option key={value} value={value}>
              {t(`kind.${value}`)}
            </option>
          ))}
        </Select>
      </label>
      {documents.isPending && <VaultSkeleton label={t("loading")} />}
      {documents.isError && (
        <InlineError
          message={t("loadFailed")}
          retryLabel={ui("retry")}
          onRetry={() => void documents.refetch()}
        />
      )}
      {remove.isError && <InlineError message={t("errors.invalid_request")} />}
      {documents.data?.length === 0 && (
        <EmptyState
          art={<EmptyArt scene="ticket" />}
          title={t("emptyTitle")}
          description={t("empty")}
          action={
            <Button
              variant="secondary"
              className="ui-button-auto"
              onClick={() =>
                window.document.getElementById(DOCUMENT_FILE_INPUT_ID)?.focus()
              }
            >
              {t("emptyCta")}
            </Button>
          }
        />
      )}
      {documentKinds.map((category) => {
        const rows =
          documents.data?.filter((document) => document.kind === category) ??
          [];
        return (
          rows.length > 0 && (
            <section key={category}>
              <h3 className="ui-group-title">{t(`kind.${category}`)}</h3>
              <ul className="ui-list">
                {rows.map((document) => {
                  const path = downloadPath(document.download_path);
                  const Icon = KIND_ICON[document.kind];
                  return (
                    <li className="ui-row document-row" key={document.id}>
                      <span className="ui-row-chip" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <div className="ui-row-main">
                        <h4 className="ui-row-title">{document.title}</h4>
                        <p className="ui-row-meta">
                          {Math.ceil(document.size / 1024)} KB ·{" "}
                          {t(`visibility.${document.visibility}`)}
                        </p>
                        {document.valid_until && (
                          <p className="ui-row-meta">
                            {t("validUntil", { date: day(document.valid_until) })}
                          </p>
                        )}
                      </div>
                      <div className="ui-row-actions">
                        {path && (
                          <ButtonLink
                            href={path}
                            variant="secondary"
                            size="sm"
                            aria-label={t("downloadNamed", {
                              title: document.title,
                            })}
                          >
                            {t("download")}
                          </ButtonLink>
                        )}
                        {path &&
                          (document.mime === "application/pdf" ||
                            document.mime.startsWith("image/")) && (
                            <ButtonLink
                              href={`${path}?inline=true`}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="link"
                            >
                              {t("view")}
                            </ButtonLink>
                          )}
                        <Button
                          variant="icon"
                          aria-label={t("edit")}
                          onClick={() => setEditing(document.id)}
                        >
                          <PencilSimpleIcon size={20} aria-hidden="true" />
                        </Button>
                        {document.can_delete && (
                          <Button
                            variant="icon"
                            aria-label={t("delete")}
                            onClick={() => remove.mutate(document.id)}
                            disabled={remove.isPending}
                          >
                            <TrashIcon size={20} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
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
