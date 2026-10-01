"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTripContext } from "@/features/trips/TripProvider";
import { CountdownBadge } from "../components/CountdownBadge";
import { daysUntil } from "../lib/countdown";

/** Overview card: "Faltan 23 días" until the trip starts. Hidden when undated or already started. */
/** Overview cards receive `{tripId, crewId}`; the trip itself comes from the TripProvider. */
export function CountdownCard(props: { tripId: string; crewId: string }) {
  void props;
  const t = useTranslations("pwa.countdown");
  const { trip } = useTripContext();
  const [now] = useState(() => new Date());

  if (!trip.start_on) return null;
  const days = daysUntil(trip.start_on, trip.timezone, now);
  if (days < 0) return null;

  const label = days === 0 ? t("today") : days === 1 ? t("tomorrow") : t("days", { days });
  return <CountdownBadge title={t("title")} label={label} />;
}
