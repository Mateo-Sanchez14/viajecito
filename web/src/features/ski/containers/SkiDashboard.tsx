"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTripContext } from "@/features/trips/TripProvider";
import { ApiError } from "@/shared/api/errors";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { LevelGroups } from "../components/LevelGroups";
import { useSkiOverview } from "../hooks/queries";
import { ConditionsPanel } from "./ConditionsPanel";
import { GearPlanner } from "./GearPlanner";
import { PassTracker } from "./PassTracker";
import { ResortPicker } from "./ResortPicker";

/** The enabled-module part: every section reads the shared overview cache entry. */
function SkiSections({ tripId }: { tripId: string }) {
  const t = useTranslations("ski");
  const { data: overview, error, isPending, refetch } = useSkiOverview(tripId);

  if (error instanceof ApiError && error.code === "module_not_enabled") {
    return <EmptyState title={t("errors.module_not_enabled")} />;
  }
  if (error) {
    return (
      <EmptyState
        title={t("loadFailed")}
        action={<Button variant="link" onClick={() => refetch()}>{t("retry")}</Button>}
      />
    );
  }
  if (isPending) return <Skeleton className="h-64" />;

  return (
    <>
      <ResortPicker tripId={tripId} />
      <ConditionsPanel tripId={tripId} />
      <PassTracker tripId={tripId} />
      <GearPlanner tripId={tripId} />
      <Card as="section" aria-labelledby="ski-levels-title" className="flex flex-col gap-3">
        <h2 id="ski-levels-title" className="text-lg font-semibold">{t("levels.title")}</h2>
        <LevelGroups groups={overview.levels} />
      </Card>
    </>
  );
}

/** Container: the ski section of a trip (resorts, conditions, passes, gear, levels). */
export function SkiDashboard({ tripId }: { tripId: string }) {
  const t = useTranslations("ski");
  const { modules } = useTripContext();

  if (!modules.includes("ski")) return <EmptyState title={t("notSki")} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <Link href="/me/ski" className="text-sm underline underline-offset-2">{t("profileLink")}</Link>
      </div>
      <SkiSections tripId={tripId} />
    </div>
  );
}
