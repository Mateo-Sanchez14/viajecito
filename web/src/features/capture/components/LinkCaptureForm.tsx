"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { proposalPath } from "@/features/proposals/lib/paths";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { useCaptureProposal } from "../hooks/useCaptureMutations";
import { useFocusOnMount } from "../hooks/useFocusOnMount";
import { toCaptureError, type CaptureErrorKey } from "../lib/errors";
import { parseCaptureUrl } from "../lib/url";
import type { Proposal } from "@/features/proposals/api/proposals";

type LinkCaptureFormProps = {
  tripId: string | null;
  crewId?: string;
  onBack: () => void;
  onCreated: (proposal: Proposal) => void;
  /** The duplicate notice links to the existing proposal: the sheet has to close when it is followed. */
  onNavigate: () => void;
};

/** Pastes a link and creates a proposal from it (the api reads the page preview). */
export function LinkCaptureForm({ tripId, crewId, onBack, onCreated, onNavigate }: LinkCaptureFormProps) {
  const t = useTranslations("capture");
  const create = useCaptureProposal(tripId);
  const urlRef = useFocusOnMount<HTMLInputElement>();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ key: CaptureErrorKey | "urlRequired"; proposalId?: string } | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending || !tripId) return;
    if (!url.trim()) return setError({ key: "urlRequired" });
    const normalized = parseCaptureUrl(url);
    if (!normalized) return setError({ key: "invalidUrl" });

    setError(null);
    create.mutate(
      { url: normalized, ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: onCreated, onError: (failure) => setError(toCaptureError(failure)) },
    );
  }

  const proposalId = error?.proposalId;

  return (
    <form noValidate onSubmit={onSubmit} className="capture-form" aria-label={t("link.title")}>
      <label className="ui-field">
        {t("link.url")}
        <Input
          ref={urlRef}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder={t("link.urlPlaceholder")}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <div id={errorId} role="alert" className="capture-error">
          <p>{t(`errors.${error.key}`)}</p>
          {proposalId && crewId && tripId && (
            <Link href={proposalPath(crewId, tripId, proposalId)} onClick={onNavigate} className="capture-error-link">
              {t("errors.seeExisting")}
            </Link>
          )}
        </div>
      )}
      <label className="ui-field">
        {t("link.note")}
        <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </label>
      {!tripId && <p className="ui-hint">{t("errors.tripRequired")}</p>}
      <div className="capture-actions">
        <Button type="submit" className="ui-button-auto" disabled={create.isPending || !tripId}>
          {create.isPending ? t("link.submitting") : t("link.submit")}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}
