"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/errors";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { WarningCircleIcon } from "@/ui/icons";
import {
  uploadDocument,
  validateUpload,
  type Document,
} from "../api/documents";
export const documentKinds = [
  "reservation",
  "ticket",
  "insurance",
  "id",
  "photo",
  "other",
] as const;
/** The file input's id: the empty state points its call to action here. */
export const DOCUMENT_FILE_INPUT_ID = "document-file";
export function UploadDocumentForm({ tripId }: { tripId: string }) {
  const t = useTranslations("documents");
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Document["kind"]>("other");
  const [visibility, setVisibility] = useState<Document["visibility"]>("crew");
  const [validUntil, setValidUntil] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected");
      const data = new FormData();
      data.append("file", file);
      if (title.trim()) data.append("title", title.trim());
      data.append("kind", kind);
      data.append("visibility", kind === "id" ? "owner_only" : visibility);
      if (validUntil) data.append("valid_until", validUntil);
      return uploadDocument(tripId, data, setProgress);
    },
    onSuccess: async () => {
      setFile(null);
      setTitle("");
      await cache.invalidateQueries({ queryKey: ["documents", tripId] });
    },
  });
  const error =
    validation ??
    (upload.error instanceof ApiError
      ? upload.error.code
      : upload.isError
        ? "invalid_request"
        : null);
  const known = [
    "file_too_large",
    "unsupported_type",
    "quota_exceeded",
    "invalid_request",
    "delivery_unavailable",
    "csrf_failed",
  ];
  return (
    <form
      className="ui-card ui-form bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (file) {
          const issue = validateUpload(file);
          setValidation(issue);
          if (!issue) upload.mutate();
        }
      }}
    >
      <h3 className="ui-form-title">{t("upload")}</h3>
      <label className="ui-field">
        {t("file")}
        <Input
          id={DOCUMENT_FILE_INPUT_ID}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
          aria-describedby={error ? "upload-error" : undefined}
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            setValidation(chosen ? validateUpload(chosen) : null);
            upload.reset();
          }}
        />
      </label>
      <div className="ui-field-grid">
        <label className="ui-field">
          {t("name")}
          <Input
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ui-field">
          {t("kindLabel")}
          <Select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as Document["kind"];
              setKind(next);
              if (next === "id") setVisibility("owner_only");
            }}
          >
            {documentKinds.map((value) => (
              <option key={value} value={value}>
                {t(`kind.${value}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="ui-field">
          {t("visibilityLabel")}
          <Select
            value={kind === "id" ? "owner_only" : visibility}
            disabled={kind === "id"}
            onChange={(e) =>
              setVisibility(e.target.value as Document["visibility"])
            }
          >
            <option value="crew">{t("visibility.crew")}</option>
            <option value="owner_only">{t("visibility.owner_only")}</option>
          </Select>
        </label>
        <label className="ui-field">
          {t("expiry")}
          <Input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
      </div>
      {(kind === "id" || visibility === "owner_only") && (
        <p className="ui-hint">{t("privateHelp")}</p>
      )}
      {error && (
        <p id="upload-error" role="alert" className="ui-notice">
          <WarningCircleIcon size={18} aria-hidden="true" />
          {t(`errors.${known.includes(error) ? error : "invalid_request"}`)}
        </p>
      )}
      {upload.isPending && (
        <p aria-live="polite" className="ui-hint ui-tabular">
          {t("progress", { percent: progress })}
        </p>
      )}
      {upload.isSuccess && (
        <p role="status" className="ui-hint">
          {t("uploaded")}
        </p>
      )}
      <div className="ui-form-actions">
        <Button
          type="submit"
          className="ui-button-auto"
          disabled={!file || !!validation || upload.isPending}
        >
          {t("upload")}
        </Button>
      </div>
    </form>
  );
}
