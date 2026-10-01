"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { useProposalsSummary } from "../hooks/queries";
import { proposalPath, proposalsPath } from "../lib/paths";

type ProposalsOverviewCardProps = { tripId: string; crewId: string };

/** Overview card: counts by status and the three most voted open proposals. */
export function ProposalsOverviewCard({ tripId, crewId }: ProposalsOverviewCardProps) {
  const t = useTranslations("proposals");
  const { data, isPending, isError } = useProposalsSummary(tripId);
  const total = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <Card as="section" className="flex h-full flex-col gap-3">
      <h3 className="text-base font-semibold">
        <Link href={proposalsPath(crewId, tripId)} className="underline-offset-2 hover:underline">
          {t("overview.title")}
        </Link>
      </h3>

      {isPending && <Skeleton className="h-12" />}
      {isError && (
        <p role="alert" className="text-sm text-warn">
          {t("loadFailed")}
        </p>
      )}
      {data && total === 0 && <p className="text-sm text-muted">{t("overview.empty")}</p>}
      {data && total > 0 && (
        <>
          <p className="text-sm text-muted">
            {t("overview.counts", { proposed: data.counts.proposed ?? 0, chosen: data.counts.chosen ?? 0 })}
          </p>
          {data.top.length > 0 && (
            <ul aria-label={t("overview.topLabel")} className="flex flex-col gap-1">
              {data.top.map((proposal) => (
                <li key={proposal.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    href={proposalPath(crewId, tripId, proposal.id)}
                    className="min-w-0 truncate font-medium underline-offset-2 hover:underline"
                  >
                    {proposal.title}
                  </Link>
                  <span className="shrink-0 text-muted">{t("overview.score", { score: proposal.tally.score })}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
