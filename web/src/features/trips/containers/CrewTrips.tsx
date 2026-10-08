"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { Button } from "@/ui/atoms/Button";
import { PlusIcon } from "@/ui/icons";
import { useHomeTrips } from "../hooks/useHomeTrips";
import { CreateTripSheet } from "./CreateTripSheet";
import { TripList } from "./TripList";

type Crew = ReturnType<typeof useMe>["crews"][number];

/** One crew's block: a heading row with its "new trip" button, the trip groups and the creation sheet. */
function CrewTripsBlock({
  crew,
  heading,
  level,
  named,
  featuredTripId,
}: {
  crew: Crew;
  heading: ReactNode;
  level: 3 | 4;
  /** Name the crew inside the sheet (several crews). */
  named: boolean;
  featuredTripId?: string;
}) {
  const t = useTranslations("trips");
  const [open, setOpen] = useState(false);
  return (
    <section className="crew-section flex w-full min-w-0 flex-col gap-5">
      <div className="home-trips-head">
        {heading}
        <Button variant="primary" size="sm" className="ui-button-auto" onClick={() => setOpen(true)}>
          <PlusIcon size={18} aria-hidden="true" />
          {t("create.open")}
        </Button>
      </div>
      <TripList crewId={crew.id} level={level} featuredTripId={featuredTripId} />
      <CreateTripSheet
        crewId={crew.id}
        crewName={named ? crew.name : undefined}
        open={open}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}

/**
 * Container: the person's trips. A single crew needs no crew heading ("Mis viajes" is the title and
 * carries the new-trip button); with several, each crew gets its own heading and button.
 */
export function CrewTrips() {
  const t = useTranslations("trips");
  const empty = useTranslations("home.crews")("empty");
  const { crews } = useMe();
  const { picked } = useHomeTrips();
  const featuredTripId = picked?.trip.id;
  const title = <h2 className="home-title font-semibold">{t("title")}</h2>;

  if (crews.length === 0) {
    return (
      <>
        {title}
        <p className="text-sm text-muted">{empty}</p>
      </>
    );
  }
  if (crews.length === 1) {
    return (
      <CrewTripsBlock crew={crews[0]} heading={title} level={3} named={false} featuredTripId={featuredTripId} />
    );
  }
  return (
    <>
      {title}
      {crews.map((crew) => (
        <CrewTripsBlock
          key={crew.id}
          crew={crew}
          heading={<h3 className="crew-title text-lg font-semibold">{crew.name}</h3>}
          level={4}
          named
          featuredTripId={featuredTripId}
        />
      ))}
    </>
  );
}
