"use client";
import dynamic from "next/dynamic";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { mapPlaces } from "../lib/places";
import { useMapProposals } from "../hooks/useMapProposals";
import { MapLegend } from "../components/MapLegend";
import { PlaceList } from "../components/PlaceList";
import { MapErrorBoundary } from "../components/MapErrorBoundary";
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});
export function ProposalsMap({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("map");
  const listId = useId();
  const { data, isPending, isError } = useMapProposals(tripId);
  const places = mapPlaces(data ?? []);
  const missing = (data?.length ?? 0) - places.length;
  const categories = [
    ...new Set(places.map((place) => place.proposal.category)),
  ];
  return (
    <main className="min-w-0 space-y-7">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-lg text-sm leading-relaxed text-muted">
          {t("body")}
        </p>
      </header>
      {isPending && (
        <div role="status" aria-label={t("loading")}>
          <Skeleton className="h-96 w-full" />
        </div>
      )}
      {isError && <p role="alert">{t(data ? "refreshError" : "error")}</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium" role="status">
              {t("located", { n: places.length })}
            </p>
            <a
              href={`#${listId}`}
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              {t("jumpToList")}
            </a>
          </div>
          {places.length > 0 ? (
            <section
              aria-label={t("title")}
              className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
            >
              <MapErrorBoundary
                fallback={
                  <p role="status" className="p-6">
                    {t("mapUnavailable")}
                  </p>
                }
              >
                <MapCanvas places={places} tripId={tripId} crewId={crewId} />
              </MapErrorBoundary>
              <div className="border-t border-border px-5 py-4">
                <MapLegend categories={categories} />
              </div>
            </section>
          ) : (
            <Card className="border-dashed py-10 text-center">
              <p className="text-lg font-semibold tracking-tight">
                {t(data.length ? "noLocated" : "emptyTitle")}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                {t(data.length ? "noLocatedHelp" : "empty")}
              </p>
            </Card>
          )}
          {missing > 0 && (
            <p className="text-sm text-muted">
              {t("noCoordinates", { n: missing })}
            </p>
          )}
          {data.length > 0 && (
            <PlaceList
              id={listId}
              proposals={data}
              tripId={tripId}
              crewId={crewId}
            />
          )}
        </>
      )}
    </main>
  );
}
