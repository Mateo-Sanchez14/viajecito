"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { PlusIcon } from "@/ui/icons";
import { CreateTripForm } from "./CreateTripForm";
import { TripList } from "./TripList";

/** Container: for each of the person's crews, its trips and a collapsible "new trip" form. */
export function CrewTrips() {
  const t = useTranslations("trips");
  const empty = useTranslations("home.crews")("empty");
  const { crews } = useMe();

  return (
    <>
      <h2 className="home-title font-semibold">{t("title")}</h2>
      {crews.length === 0 && <p className="text-sm text-muted">{empty}</p>}
      {crews.map((crew) => (
        <section key={crew.id} className="crew-section flex w-full min-w-0 flex-col gap-4">
          <h3 className="crew-title text-lg font-semibold">{crew.name}</h3>
          <TripList crewId={crew.id} />
          <details className="create-trip-disclosure border border-border bg-surface p-4">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
              <PlusIcon size={18} aria-hidden="true" />
              {t("create.open")}
            </summary>
            <div className="pt-4">
              <CreateTripForm crewId={crew.id} />
            </div>
          </details>
        </section>
      ))}
    </>
  );
}
