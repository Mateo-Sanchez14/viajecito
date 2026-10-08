"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { useAmbientAllowed } from "@/shared/lib/useAmbientAllowed";
import { Button } from "@/ui/atoms/Button";
import { PlusIcon } from "@/ui/icons";
import { ambientClip } from "@/ui/ambient/scenes";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { AmbientVideo } from "@/ui/molecules/AmbientVideo";
import { LandingHero, type LandingNext } from "@/ui/organisms/LandingHero";
import { coverPath } from "../api/cover";
import { useCoverFallback } from "../hooks/useCoverFallback";
import { useHomeTrips } from "../hooks/useHomeTrips";
import { coverScene } from "../lib/coverScene";
import { describeCountdown } from "../lib/describeCountdown";
import { tripPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";
import { CreateTripSheet } from "./CreateTripSheet";

/** Container: greets the person and features their next trip, from the trips the list below already fetches. */
export function HomeHero() {
  const t = useTranslations();
  const countdownCopy = useTranslations("trips.hero.countdown");
  const dateRange = useDateRange();
  const { person } = useMe();
  const allowMotion = useAmbientAllowed();
  const { crews, results, failed, picked } = useHomeTrips();
  const [creating, setCreating] = useState(false);
  const createCrew = crews[0];
  const featured = picked ?? null;
  const cover = useCoverFallback(featured?.trip ?? null);

  const name = person.display_name.trim();
  // Never the phone: a person without a display name gets the neutral greeting.
  const greeting = name ? t("home.greeting", { name }) : t("home.greetingAnonymous");

  let next: LandingNext;
  if (crews.length === 0) {
    next = { status: "empty", title: t("home.hero.empty.title"), body: t("home.hero.empty.body") };
  } else if (failed) {
    next = {
      status: "error",
      message: t("trips.list.error"),
      retryLabel: t("ui.retry"),
      onRetry: () => {
        for (const result of results) if (result.isError) void result.refetch();
      },
    };
  } else if (picked === undefined) {
    next = { status: "loading", label: t("home.hero.loading") };
  } else if (picked === null) {
    next = {
      status: "empty",
      title: t("home.hero.empty.title"),
      body: t("home.hero.empty.body"),
      action: (
        <Button variant="primary" size="sm" className="ui-button-auto" onClick={() => setCreating(true)}>
          <PlusIcon size={18} aria-hidden="true" />
          {t("home.hero.empty.cta")}
        </Button>
      ),
    };
  } else {
    next = {
      status: "trip",
      label: t("home.hero.next"),
      name: picked.trip.name,
      destination: picked.trip.destination_label || undefined,
      dates: dateRange(picked.trip.start_on, picked.trip.end_on),
      href: tripPath(picked.crewId, picked.trip.id),
      cta: t("home.hero.open"),
      countdown: describeCountdown(picked.countdown, (key, values) => countdownCopy(key, values), null),
    };
  }

  const scene = featured ? coverScene(featured.trip) : "road";
  // Footage only for a featured trip: loading, error and empty states keep the plain illustration.
  const clip = featured ? ambientClip(scene) : null;
  const media =
    featured && cover.showPhoto ? (
      // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authorized endpoint: next/image cannot forward the session
      <img src={coverPath(featured.trip)} alt="" decoding="async" className="trip-hero-photo" onError={cover.onError} />
    ) : (
      <>
        <TripCoverArt scene={scene} live />
        {clip && <AmbientVideo src={clip.mp4} poster={clip.poster} play={allowMotion} />}
      </>
    );

  return (
    <>
      <LandingHero media={media} greeting={greeting} tagline={t("app.tagline")} next={next} />
      {createCrew && (
        <CreateTripSheet
          crewId={createCrew.id}
          crewName={crews.length > 1 ? createCrew.name : undefined}
          open={creating}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
