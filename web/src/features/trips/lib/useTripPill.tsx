"use client";

import { useTranslations } from "next-intl";
import { useCountUp } from "@/shared/lib/useCountUp";
import type { TripCardPill } from "@/ui/organisms/TripCard";
import type { Countdown } from "./countdown";

/** "en 12 días" with the number counting up on mount (the final text at once under reduced motion). */
function UpcomingText({ days }: { days: number }) {
  const t = useTranslations("trips.card.pill");
  return <>{t("upcoming", { days: useCountUp(days) })}</>;
}

/** Returns the card pill for where a trip stands in time; `undefined` while unknown or without dates. */
export function useTripPill() {
  const t = useTranslations("trips.card.pill");
  return (countdown: Countdown | null): TripCardPill | undefined => {
    switch (countdown?.kind) {
      case "upcoming":
        return {
          tone: "quiet",
          content: countdown.days === 1 ? t("tomorrow") : <UpcomingText days={countdown.days} />,
        };
      case "today":
        return { tone: "live", content: t("today") };
      case "ongoing":
        return { tone: "live", content: t("ongoing") };
      case "done":
        return { tone: "quiet", content: t("done") };
      default:
        return undefined;
    }
  };
}
