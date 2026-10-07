"use client";

import { useTranslations } from "next-intl";
import { StatCard } from "@/ui/molecules/StatCard";
import { UsersThreeIcon } from "@/ui/icons";
import { useTripContext } from "../TripProvider";
import { peopleStat } from "./logic";
import type { TripStat } from "./types";

/** Stat: how many people confirmed. Reads the participants already on the trip, so it never loads. */
export const PeopleStat: TripStat["Component"] = () => {
  const t = useTranslations("trips.stats.people");
  const { participants } = useTripContext();
  const { value, total, progress } = peopleStat(participants);

  return (
    <StatCard
      icon={<UsersThreeIcon size={20} aria-hidden="true" />}
      value={String(value)}
      label={t("label")}
      detail={t("detail", { total })}
      progress={{ value: progress, label: t("progress") }}
      href="#rsvp"
    />
  );
};
