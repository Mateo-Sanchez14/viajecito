"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTripContext } from "@/features/trips/TripProvider";
import { useDateRange } from "@/features/trips/lib/useDateRange";
import { ApiError } from "@/shared/api/errors";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { EmptyState } from "@/ui/molecules/EmptyState";
import type { Proposal, ProposalStatus } from "../api/proposals";
import { CategoryChip } from "../components/CategoryChip";
import { PriceTag } from "../components/PriceTag";
import { ProposalThumbnail } from "../components/ProposalThumbnail";
import { StatusBadge } from "../components/StatusBadge";
import { StatusControl } from "../components/StatusControl";
import { VoteButtons } from "../components/VoteButtons";
import { useRefreshPreview, useTransition } from "../hooks/mutations";
import { useProposal } from "../hooks/queries";
import { proposalsPath } from "../lib/paths";
import { safeHttpUrl } from "../lib/links";
import { useErrorMessage } from "../lib/useErrorMessage";
import { BookingRefForm } from "./BookingRefForm";
import { CommentThread } from "./CommentThread";
import { ProposalEditForm } from "./ProposalEditForm";

const VOTE_KEY = { 1: "up", 0: "neutral", [-1]: "down" } as const;

type ProposalDetailProps = { proposalId: string; initialProposal?: Proposal };

/** Container: one proposal with its preview, votes, status controls, edit form and comments. */
export function ProposalDetail({ proposalId, initialProposal }: ProposalDetailProps) {
  const t = useTranslations("proposals");
  const status = useTranslations("proposals.status");
  const { trip } = useTripContext();
  const dateRange = useDateRange();
  const errorMessage = useErrorMessage();
  const query = useProposal(proposalId, initialProposal);
  const transition = useTransition(proposalId);
  const refresh = useRefreshPreview(proposalId);
  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const back = (
    <Link href={proposalsPath(trip.crew_id, trip.id)} className="text-sm text-muted underline underline-offset-2">
      {t("back")}
    </Link>
  );

  if (query.isPending) {
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-4">
        {back}
        {missing ? (
          <EmptyState title={t("detail.notFound")} />
        ) : (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm text-warn">
            <p>{t("loadFailed")}</p>
            <Button variant="link" onClick={() => void query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const proposal = query.data;
  const { preview } = proposal;
  const unreadable = preview !== null && ["blocked", "partial", "failed"].includes(preview.fetch_status);
  const hasDates = proposal.starts_on !== null || proposal.ends_on !== null;
  const link = preview ? safeHttpUrl(preview.final_url || preview.url) : null;

  function move(to: ProposalStatus) {
    transition.mutate(
      { to },
      { onSuccess: (updated) => setAnnouncement(t("transition.changed", { status: status(updated.status) })) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {back}

      <header className="flex flex-col gap-2">
        <h1 className={`text-2xl font-semibold tracking-tight ${proposal.status === "discarded" ? "line-through" : ""}`}>
          {proposal.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={proposal.category} />
          <StatusBadge status={proposal.status} />
          <PriceTag amount={proposal.est_price} currency={proposal.currency} basis={proposal.price_basis} />
        </div>
        {hasDates && <p className="text-sm text-muted">{dateRange(proposal.starts_on, proposal.ends_on)}</p>}
        <p className="text-sm text-muted">{t("card.by", { author: proposal.author.display_name })}</p>
      </header>

      {preview && (
        <Card as="section" className="flex gap-3">
          <ProposalThumbnail proposalId={proposal.id} preview={preview} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {preview.site_name && <p className="text-sm text-muted">{preview.site_name}</p>}
            {preview.fetch_status === "pending" && (
              <>
                <p className="break-all text-sm text-muted">{preview.url}</p>
                <p className="text-sm text-muted">{t("preview.pending")}</p>
              </>
            )}
            {unreadable && <p className="text-sm text-muted">{t("preview.blocked")}</p>}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 content-center text-sm font-medium underline underline-offset-2"
              >
                {t("detail.openLink")}
              </a>
            )}
            {unreadable && (
              <Button variant="link" disabled={refresh.isPending} onClick={() => refresh.mutate()} className="min-h-11 self-start">
                {t("preview.refresh")}
              </Button>
            )}
            {refresh.isSuccess && <p className="text-sm text-muted">{t("preview.refreshQueued")}</p>}
            {refresh.isError && (
              <p role="alert" className="text-sm text-warn">
                {errorMessage(refresh.error)}
              </p>
            )}
          </div>
        </Card>
      )}

      {proposal.note && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("detail.note")}</h2>
          <p className="whitespace-pre-wrap break-words">{proposal.note}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("detail.votes")}</h2>
        <VoteButtons proposalId={proposal.id} tally={proposal.tally} disabled={proposal.status === "discarded"} />
        {proposal.tally.majority && <p className="text-sm font-medium text-ok">{t("detail.majority")}</p>}
        {proposal.votes.length === 0 ? (
          <p className="text-sm text-muted">{t("detail.noVotes")}</p>
        ) : (
          <ul aria-label={t("detail.votes")} className="flex flex-col gap-1">
            {proposal.votes.map(({ person, value }) => (
              <li key={person.person_id} className="flex justify-between gap-3 text-sm">
                <span className="font-medium">{person.display_name}</span>
                <span className="text-muted">{t(`vote.${VOTE_KEY[value]}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <StatusControl
          status={proposal.status}
          allowedTransitions={proposal.allowed_transitions}
          onTransition={move}
          pending={transition.isPending}
        />
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {announcement}
        </p>
        {transition.isError && (
          <p role="alert" className="text-sm text-warn">
            {errorMessage(transition.error)}
          </p>
        )}
        {(proposal.status === "chosen" || proposal.status === "booked") && (
          <BookingRefForm key={proposal.booking_ref} proposalId={proposal.id} bookingRef={proposal.booking_ref} />
        )}
      </section>

      {editing ? (
        <ProposalEditForm proposal={proposal} onDone={() => setEditing(false)} />
      ) : (
        <Button variant="link" onClick={() => setEditing(true)} className="min-h-11 self-start">
          {t("detail.edit")}
        </Button>
      )}

      <CommentThread proposalId={proposal.id} />
    </div>
  );
}
