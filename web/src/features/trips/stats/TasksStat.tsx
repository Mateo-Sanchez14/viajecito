"use client";

import { useTranslations } from "next-intl";
import { useTasks } from "@/features/logistics/hooks/queries";
import { StatCard } from "@/ui/molecules/StatCard";
import { CheckSquareIcon } from "@/ui/icons";
import { sectionPath } from "../lib/paths";
import { tasksStat } from "./logic";
import type { TripStat } from "./types";

/** Stat: tasks done. Shares the tasks query with the logistics overview card. */
export const TasksStat: TripStat["Component"] = ({ tripId, crewId }) => {
  const t = useTranslations("trips.stats.tasks");
  const { data, isPending, isError } = useTasks(tripId);
  const icon = <CheckSquareIcon size={20} aria-hidden="true" />;

  if (isError) return null;
  if (isPending) return <StatCard icon={icon} value="" label="" loading />;

  const { value, total, overdue, progress } = tasksStat(data);
  // "0 tareas hechas de 0" with an empty bar reads as a failure: say there is nothing to do yet.
  if (total === 0) {
    return (
      <StatCard
        icon={icon}
        value={t("emptyValue")}
        label={t("emptyLabel")}
        detail={t("emptyDetail")}
        href={sectionPath(crewId, tripId, "logistics")}
      />
    );
  }
  return (
    <StatCard
      icon={icon}
      value={String(value)}
      label={t("label", { count: value })}
      detail={overdue > 0 ? t("overdue", { count: overdue }) : t("detail", { total })}
      progress={{ value: progress, label: t("progress") }}
      href={sectionPath(crewId, tripId, "logistics")}
    />
  );
};
