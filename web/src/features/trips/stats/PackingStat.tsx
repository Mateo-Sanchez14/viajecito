"use client";

import { useTranslations } from "next-intl";
import { usePackingSummary } from "@/features/logistics/hooks/queries";
import { StatCard } from "@/ui/molecules/StatCard";
import { SuitcaseRollingIcon } from "@/ui/icons";
import { sectionPath } from "../lib/paths";
import { useTripContext } from "../TripProvider";
import { packingStat } from "./logic";
import type { TripStat } from "./types";

/** Stat: how much of my own packing list is packed. Shares the packing summary query with logistics. */
export const PackingStat: TripStat["Component"] = ({ tripId, crewId }) => {
  const t = useTranslations("trips.stats.packing");
  const { me } = useTripContext();
  const { data, isPending, isError } = usePackingSummary(tripId);
  const icon = <SuitcaseRollingIcon size={20} aria-hidden="true" />;

  if (isError) return null;
  if (isPending) return <StatCard icon={icon} value="" label="" loading />;

  const stat = packingStat(data, me.person.id);
  if (!stat) return null;
  return (
    <StatCard
      icon={icon}
      value={String(stat.value)}
      label={t("label")}
      detail={t("detail", { total: stat.total })}
      progress={{ value: stat.progress, label: t("progress") }}
      href={sectionPath(crewId, tripId, "logistics")}
    />
  );
};
