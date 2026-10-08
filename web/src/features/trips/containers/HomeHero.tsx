"use client";

import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { useClientNow } from "@/shared/lib/useClientNow";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { LandingHero, type LandingNext } from "@/ui/organisms/LandingHero";
import { coverPath } from "../api/cover";
import { listTrips, tripKeys } from "../api/trips";
import { useCoverFallback } from "../hooks/useCoverFallback";
import { coverScene } from "../lib/coverScene";
import { describeCountdown } from "../lib/describeCountdown";
import { pickNextTrip } from "../lib/nextTrip";
import { tripPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";

/** Container: greets the person and features their next trip, from the trips the list below already fetches. */
export function HomeHero() {
  const t = useTranslations();
  const countdownCopy = useTranslations("trips.hero.countdown");
  const dateRange = useDateRange();
  const { person, crews } = useMe();
  const now = useClientNow();
  // Same keys and fetcher as TripList: the two share one request per crew.
  const results = useQueries({
    queries: crews.map((crew) => ({ queryKey: tripKeys.crew(crew.id), queryFn: () => listTrips(crew.id) })),
  });
  const pending = results.some((result) => result.isPending);
  const failed = results.some((result) => result.isError);

  const defaults = new Set(crews.flatMap((crew) => (crew.default_trip_id ? [crew.default_trip_id] : [])));
  const ready = crews.length > 0 && !pending && !failed && now !== null;
  // undefined = still working it out, null = nothing to feature.
  const picked = ready
    ? pickNextTrip(
        crews.map((crew, index) => ({ crewId: crew.id, trips: results[index].data ?? [] })),
        defaults,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        now,
      )
    : undefined;
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
    next = { status: "empty", title: t("home.hero.empty.title"), body: t("home.hero.empty.body") };
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
  const media =
    featured && cover.showPhoto ? (
      // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authorized endpoint: next/image cannot forward the session
      <img src={coverPath(featured.trip)} alt="" decoding="async" className="trip-hero-photo" onError={cover.onError} />
    ) : (
      <TripCoverArt scene={scene} live />
    );

  return <LandingHero media={media} greeting={greeting} tagline={t("app.tagline")} next={next} />;
}
