"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MapProposal } from "../api/proposals";
import { categoryColors, mapPlaces, proposalPath } from "../lib/places";
export function PlaceList({
  proposals,
  tripId,
  crewId,
  id,
}: {
  proposals: MapProposal[];
  tripId: string;
  crewId: string;
  id: string;
}) {
  const t = useTranslations("map");
  const locatedIds = new Set(
    mapPlaces(proposals).map((place) => place.proposal.id),
  );
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">
        {t("listFallback")}
      </h2>
      <ol aria-label={t("listFallback")} className="divide-y divide-border">
        {proposals.map((proposal, index) => (
          <li key={proposal.id} className="flex items-start gap-4 py-4">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: categoryColors[proposal.category] }}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={proposalPath(crewId, tripId, proposal.id)}
                className="inline-flex min-h-11 items-center break-words font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                {proposal.title}
              </Link>
              <p className="text-sm text-muted">
                {t(`category.${proposal.category}`)} ·{" "}
                {t(`status.${proposal.status}`)}
              </p>
              {!locatedIds.has(proposal.id) && (
                <p className="mt-1 text-sm text-muted">
                  {t("missingLocation")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
