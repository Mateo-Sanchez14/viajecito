"use client";

import { useTranslations } from "next-intl";
import { useProposalsSummary } from "@/features/proposals/hooks/queries";
import { StatCard } from "@/ui/molecules/StatCard";
import { LightbulbIcon } from "@/ui/icons";
import { sectionPath } from "../lib/paths";
import { proposalsStat } from "./logic";
import type { TripStat } from "./types";

/** Stat: proposals decided (chosen or booked). Shares the proposals summary query with its overview card. */
export const ProposalsStat: TripStat["Component"] = ({ tripId, crewId }) => {
  const t = useTranslations("trips.stats.proposals");
  const { data, isPending, isError } = useProposalsSummary(tripId);
  const icon = <LightbulbIcon size={20} aria-hidden="true" />;

  if (isError) return null;
  if (isPending) return <StatCard icon={icon} value="" label="" loading />;

  const { value, open, progress } = proposalsStat(data.counts);
  return (
    <StatCard
      icon={icon}
      value={String(value)}
      label={t("label", { count: value })}
      detail={t("detail", { open })}
      progress={{ value: progress, label: t("progress") }}
      href={sectionPath(crewId, tripId, "proposals")}
    />
  );
};
