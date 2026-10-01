"use client";

import { useTranslations } from "next-intl";
import type { TripCard } from "@/features/trips/cards/types";
import { useTripContext } from "@/features/trips/TripProvider";
import { CountdownBadge } from "../components/CountdownBadge";
import { useClientNow } from "../hooks/useClientNow";
import { daysUntil } from "../lib/countdown";

/**
 * Overview card: "N days left" until the trip starts. Hidden when undated or already started.
 * The trip comes from the TripProvider, so the card ignores its `{tripId, crewId}` props.
 */
export const CountdownCard: TripCard["Component"] = () => {
  const t = useTranslations("pwa.countdown");
  const { trip } = useTripContext();
  const now = useClientNow();

  if (!trip.start_on || !now) return null;
  const days = daysUntil(trip.start_on, trip.timezone, now);
  if (days < 0) return null;

  const label = days === 0 ? t("today") : days === 1 ? t("tomorrow") : t("days", { days });
  return <CountdownBadge title={t("title")} label={label} />;
};
