"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sectionPath } from "@/features/trips/lib/paths";
import { useDateRange } from "@/features/trips/lib/useDateRange";
import { useSectionLabel } from "@/features/trips/lib/useSectionLabel";
import { useTripContext } from "@/features/trips/TripProvider";
import type { Decision } from "../api/dates";
import { useAvailability, useDecisions } from "../hooks/queries";
import { useDayFormat } from "../lib/useDayFormat";

/** Overview card (`module: "dates"`): vote progress and the leading window, or the trip's dates. */
export function DatesOverviewCard({ tripId, crewId }: { tripId: string; crewId: string }) {
  const sectionLabel = useSectionLabel();
  const { data: decisions } = useDecisions(tripId);
  const open = decisions?.find((decision) => decision.status === "open");

  return (
    <Link
      href={sectionPath(crewId, tripId, "dates")}
      className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-4 hover:border-foreground/40"
    >
      <span className="font-medium">{sectionLabel("dates")}</span>
      {open ? <OpenSummary decision={open} /> : <TripDatesSummary closed={decisions?.[0]?.status === "closed"} />}
    </Link>
  );
}

function OpenSummary({ decision }: { decision: Decision }) {
  const t = useTranslations("dates.overview");
  const day = useDayFormat();
  const { data } = useAvailability(decision.id);
  const best = data?.has_data ? data.best_windows[0] : undefined;
  const voted = t("voted", { n: decision.respondents, total: decision.eligible });
  return (
    <span className="text-sm text-muted">
      {best ? `${voted} · ${t("best", { range: day.range(best.start, best.end) })}` : voted}
    </span>
  );
}

function TripDatesSummary({ closed }: { closed: boolean }) {
  const t = useTranslations("dates.overview");
  const dateRange = useDateRange();
  const { trip } = useTripContext();
  const hasDates = Boolean(trip.start_on || trip.end_on);
  return (
    <span className="text-sm text-muted">
      {hasDates
        ? [closed && t("fixed"), dateRange(trip.start_on, trip.end_on)].filter(Boolean).join(" · ")
        : t("empty")}
    </span>
  );
}
