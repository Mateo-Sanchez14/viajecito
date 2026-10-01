"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { CreateTripForm } from "./CreateTripForm";
import { TripList } from "./TripList";

/** Container: for each of the person's crews, its trips and a collapsible "new trip" form. */
export function CrewTrips() {
  const t = useTranslations("trips");
  const empty = useTranslations("home.crews")("empty");
  const { crews } = useMe();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {crews.length === 0 && <p className="text-sm text-muted">{empty}</p>}
      {crews.map((crew) => (
        <section key={crew.id} className="flex w-full flex-col gap-3">
          <h2 className="text-lg font-semibold">{crew.name}</h2>
          <TripList crewId={crew.id} />
          <details className="rounded-2xl border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">{t("create.open")}</summary>
            <div className="pt-4">
              <CreateTripForm crewId={crew.id} />
            </div>
          </details>
        </section>
      ))}
    </>
  );
}
