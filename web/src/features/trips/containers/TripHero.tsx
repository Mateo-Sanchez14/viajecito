"use client";

import { useTranslations } from "next-intl";
import { BoardingPass } from "@/ui/organisms/BoardingPass";
import { useAmbientAllowed } from "@/shared/lib/useAmbientAllowed";
import { useClientNow } from "@/shared/lib/useClientNow";
import { coverPath } from "../api/cover";
import { type Countdown, tripCountdown } from "../lib/countdown";
import { describeCountdown } from "../lib/describeCountdown";
import { useCoverFallback } from "../hooks/useCoverFallback";
import { sectionPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";
import { useTripContext } from "../TripProvider";
import { CoverControl } from "./CoverControl";
import { TripSceneMedia } from "./TripSceneMedia";

/** Container: the trip hero. Picture, how long until we leave, and the dates, destination and currency. */
export function TripHero() {
  const t = useTranslations("trips");
  const countdownCopy = useTranslations("trips.hero.countdown");
  const dateRange = useDateRange();
  const now = useClientNow();
  const { trip, modules } = useTripContext();
  const cover = useCoverFallback(trip);
  const allowMotion = useAmbientAllowed();

  // The server has no client clock: render the skeleton there so no day number can mismatch.
  // A finished trip stays finished even when its dates say otherwise.
  const state: Countdown | null = !now
    ? null
    : trip.status === "done"
      ? { kind: "done" }
      : tripCountdown(trip.start_on, trip.end_on, trip.timezone, now);
  const setDatesHref = modules.includes("dates") ? sectionPath(trip.crew_id, trip.id, "dates") : null;

  return (
    <BoardingPass
      media={
        cover.showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authorized endpoint: next/image cannot forward the session
          <img
            src={coverPath(trip)}
            alt={t("cover.alt", { name: trip.name })}
            decoding="async"
            className="trip-hero-photo"
            onError={cover.onError}
          />
        ) : (
          <TripSceneMedia trip={trip} allowMotion={allowMotion} />
        )
      }
      mediaAction={<CoverControl />}
      countdown={state && describeCountdown(state, (key, values) => countdownCopy(key, values), setDatesHref)}
      facts={[
        { label: t("hero.facts.dates"), value: dateRange(trip.start_on, trip.end_on) },
        { label: t("hero.facts.destination"), value: trip.destination_label || t("overview.noDestination") },
        { label: t("hero.facts.currency"), value: trip.currency },
      ]}
    />
  );
}
