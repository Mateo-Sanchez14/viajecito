"use client";

import { useEffect } from "react";
import { useMe } from "@/features/auth/MeProvider";
import { useTour } from "../TourProvider";
import { TOUR_VERSION } from "../lib/version";

/** Let the overview settle (hero, cards, entrance motion) before the screen is dimmed. */
export const AUTO_START_DELAY_MS = 700;

const modalIsOpen = () => document.querySelector("dialog[open]") !== null;

/**
 * Renders nothing. Mounted by the trip overview page only, so no other route can ever start the
 * tour on its own. Starts it when a replay is pending, or when this person has not seen this
 * version yet and it has not run in this visit. While another modal is open (the capture sheet) it
 * keeps waiting instead of stacking dialogs.
 */
export function TourAutoStart() {
  const tour = useTour();
  const { person } = useMe();
  const { start, isPending, wasAutoStarted, running } = tour;

  useEffect(() => {
    if (running) return;
    const due = isPending() || (!wasAutoStarted() && person.tour_seen_version < TOUR_VERSION);
    if (!due) return;

    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (modalIsOpen()) {
        timer = setTimeout(attempt, AUTO_START_DELAY_MS);
        return;
      }
      start();
    };
    timer = setTimeout(attempt, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [running, start, isPending, wasAutoStarted, person.tour_seen_version]);

  return null;
}
