"use client";

import { useTranslations } from "next-intl";
import type { TripCardPill } from "@/ui/organisms/TripCard";
import type { Countdown } from "./countdown";

/** Returns the card pill for where a trip stands in time; `undefined` while unknown or without dates. */
export function useTripPill() {
  const t = useTranslations("trips.card.pill");
  return (countdown: Countdown | null): TripCardPill | undefined => {
    switch (countdown?.kind) {
      case "upcoming":
        return {
          tone: "quiet",
          content: countdown.days === 1 ? t("tomorrow") : t("upcoming", { days: countdown.days }),
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
