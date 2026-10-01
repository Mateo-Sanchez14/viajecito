"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/errors";
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
      className="flex flex-col gap-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (file) {
          const issue = validateUpload(file);
          setValidation(issue);
          if (!issue) upload.mutate();
        }
      }}
    >
      <h2>{t("upload")}</h2>
      <label>
        {t("file")}
        <input
          className="block min-h-11 max-w-full"
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
      <label>
        {t("name")}
        <input
          className="block min-h-11 rounded border p-2"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        {t("kindLabel")}
        <select
          className="block min-h-11"
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
        </select>
      </label>
      <label>
        {t("visibilityLabel")}
        <select
          className="block min-h-11"
          value={kind === "id" ? "owner_only" : visibility}
          disabled={kind === "id"}
          onChange={(e) =>
            setVisibility(e.target.value as Document["visibility"])
          }
        >
          <option value="crew">{t("visibility.crew")}</option>
          <option value="owner_only">{t("visibility.owner_only")}</option>
        </select>
      </label>
      {(kind === "id" || visibility === "owner_only") && (
        <p>{t("privateHelp")}</p>
      )}
      <label>
        {t("expiry")}
        <input
          className="block min-h-11"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
      </label>
      {error && (
        <p id="upload-error" role="alert">
          {t(`errors.${known.includes(error) ? error : "invalid_request"}`)}
        </p>
      )}
      {upload.isPending && (
        <p aria-live="polite">{t("progress", { percent: progress })}</p>
      )}
      {upload.isSuccess && <p role="status">{t("uploaded")}</p>}
      <button
        className="min-h-11 rounded border px-3"
        type="submit"
        disabled={!file || !!validation || upload.isPending}
      >
        {t("upload")}
      </button>
    </form>
  );
}
