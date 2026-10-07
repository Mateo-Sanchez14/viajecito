"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { PageHeader } from "@/ui/molecules/PageHeader";
import { DEFAULT_FILTERS, type ProposalFilters as Filters } from "../api/proposals";
import { isFiltering, ProposalFilters } from "../components/ProposalFilters";
import { ProposalCard } from "../components/ProposalCard";
import { VoteButtons } from "../components/VoteButtons";
import { useProposals } from "../hooks/queries";
import { proposalPath } from "../lib/paths";
import { AddProposalForm } from "./AddProposalForm";

type ProposalBoardProps = { tripId: string; crewId: string };

/** Container: the trip's proposals with filters, an add form and a vote control per card. */
export function ProposalBoard({ tripId, crewId }: ProposalBoardProps) {
  const t = useTranslations("proposals");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [adding, setAdding] = useState(false);
  const { data, isPending, isError, refetch } = useProposals(tripId, filters);
  const filtering = isFiltering(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        actions={
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
            className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-medium text-background"
          >
            {adding ? t("add.close") : t("add.open")}
          </button>
        }
      />

      {adding && <AddProposalForm tripId={tripId} crewId={crewId} onCreated={() => setAdding(false)} />}

      <ProposalFilters filters={filters} onChange={setFilters} />

      {isPending && (
        <div aria-label={t("loading")} role="status" className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {isError && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-warn">
          <p>{t("loadFailed")}</p>
          <Button variant="link" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}

      {data && data.length === 0 && (
        filtering ? (
          <EmptyState
            title={t("filters.empty")}
            action={
              <Button variant="link" onClick={() => setFilters(DEFAULT_FILTERS)}>
                {t("filters.clear")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            art={<EmptyArt scene="map" />}
            title={t("empty.title")}
            description={t("empty.body")}
          />
        )
      )}

      {data && data.length > 0 && (
        <ul aria-label={t("title")} className="flex flex-col gap-3">
          {data.map((proposal) => (
            <li key={proposal.id}>
              <ProposalCard
                proposal={proposal}
                href={proposalPath(crewId, tripId, proposal.id)}
                voteSlot={
                  <VoteButtons
                    proposalId={proposal.id}
                    tally={proposal.tally}
                    disabled={proposal.status === "discarded"}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

