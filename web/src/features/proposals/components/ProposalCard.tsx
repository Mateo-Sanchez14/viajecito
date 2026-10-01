"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import type { ProposalSummary } from "../api/proposals";
import { CategoryChip } from "./CategoryChip";
import { PriceTag } from "./PriceTag";
import { ProposalThumbnail } from "./ProposalThumbnail";
import { StatusBadge } from "./StatusBadge";

type ProposalCardProps = {
  proposal: ProposalSummary;
  href: string;
  /** Wired controls (e.g. vote buttons) rendered under the summary. */
  voteSlot?: ReactNode;
};

/** One proposal in the board: preview state, status, price, tally and a link to its detail. */
export function ProposalCard({ proposal, href, voteSlot }: ProposalCardProps) {
  const t = useTranslations("proposals");
  const titleId = useId();
  const { preview, status } = proposal;
  const discarded = status === "discarded";
  const unreadable =
    preview !== null && ["blocked", "partial", "failed"].includes(preview.fetch_status);

  return (
    <Card
      as="article"
      aria-labelledby={titleId}
      className={`flex flex-col gap-3 ${discarded ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3">
        <ProposalThumbnail proposalId={proposal.id} preview={preview} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={titleId} className={`text-base font-semibold ${discarded ? "line-through" : ""}`}>
            <Link href={href} className="underline-offset-2 hover:underline">
              {proposal.title}
            </Link>
          </h3>
          {preview?.site_name && <p className="text-sm text-muted">{preview.site_name}</p>}
          {preview?.fetch_status === "pending" && (
            <>
              <p className="break-all text-sm text-muted">{preview.url}</p>
              <p className="text-sm text-muted">{t("preview.pending")}</p>
            </>
          )}
          {unreadable && <p className="text-sm text-muted">{t("preview.blocked")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip category={proposal.category} />
            <StatusBadge status={status} />
            <PriceTag amount={proposal.est_price} currency={proposal.currency} basis={proposal.price_basis} />
          </div>
          {status === "booked" && proposal.booking_ref && (
            <p className="text-sm font-medium">{t("card.booking", { ref: proposal.booking_ref })}</p>
          )}
        </div>
      </div>
      <p className="flex flex-wrap gap-x-3 text-sm text-muted">
        <span>{t("card.by", { author: proposal.author.display_name })}</span>
        <span>{t("vote.count", { up: proposal.tally.up, down: proposal.tally.down })}</span>
        <span>{t("card.comments", { count: proposal.comment_count })}</span>
      </p>
      {voteSlot}
    </Card>
  );
}
