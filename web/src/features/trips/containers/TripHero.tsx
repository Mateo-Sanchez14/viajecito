"use client";

import { useTranslations } from "next-intl";
import { ButtonLink } from "@/ui/atoms/ButtonLink";
import { BoardingPass, type BoardingPassCountdown } from "@/ui/organisms/BoardingPass";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { useClientNow } from "@/shared/lib/useClientNow";
import { type Countdown, tripCountdown } from "../lib/countdown";
import { coverScene } from "../lib/coverScene";
import { sectionPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";
import { useTripContext } from "../TripProvider";

type Translate = (key: string, values?: Record<string, number>) => string;

function describe(
  state: Countdown,
  t: Translate,
  setDatesHref: string | null,
): BoardingPassCountdown {
  switch (state.kind) {
    case "upcoming":
      return state.days === 1
        ? { value: t("tomorrow"), caption: t("tomorrowCaption") }
        : {
            value: String(state.days),
            unit: t("upcomingUnit", { days: state.days }),
            caption: t("upcomingCaption"),
          };
    case "today":
      return { value: t("today"), caption: t("todayCaption") };
    case "ongoing":
      return {
        value: t("ongoing", { day: state.day }),
        unit: t("ongoingUnit", { total: state.total }),
        caption: t("ongoingCaption"),
      };
    case "done":
      return { value: t("done"), caption: t("doneCaption") };
    case "undated":
      return {
        value: t("undated"),
        caption: t("undatedCaption"),
        action: setDatesHref ? (
          <ButtonLink href={setDatesHref} variant="secondary" size="sm">
            {t("setDates")}
          </ButtonLink>
        ) : undefined,
      };
  }
}

/** Container: the trip hero. Picture, how long until we leave, and the dates, destination and currency. */
export function TripHero() {
  const t = useTranslations("trips");
  const countdownCopy = useTranslations("trips.hero.countdown");
  const dateRange = useDateRange();
  const now = useClientNow();
  const { trip, modules } = useTripContext();

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
      media={<TripCoverArt scene={coverScene(trip)} />}
      countdown={state && describe(state, (key, values) => countdownCopy(key, values), setDatesHref)}
      facts={[
        { label: t("hero.facts.dates"), value: dateRange(trip.start_on, trip.end_on) },
        { label: t("hero.facts.destination"), value: trip.destination_label || t("overview.noDestination") },
        { label: t("hero.facts.currency"), value: trip.currency },
      ]}
    />
  );
}
