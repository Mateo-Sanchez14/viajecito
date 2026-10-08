"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useMe } from "@/features/auth/MeProvider";
import { tripPath } from "@/features/trips/lib/paths";
import { useTour } from "../TourProvider";
import { replayTarget } from "../lib/replayTarget";

type RouteParams = { crewId?: string | string[]; tripId?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The "?" entry: replays the tour on the overview of the trip on screen, else of the default trip of
 * the first crew that has one. On that overview it starts in place; elsewhere it routes there and
 * leaves a pending request for the overview to pick up. Nothing sticky (no query string, no stored
 * flag), so reloading the destination never restarts it.
 */
export function useTourReplay(): { available: boolean; replay: () => void } {
  const tour = useTour();
  const { crews } = useMe();
  const params = useParams<RouteParams>();
  const pathname = usePathname();
  const router = useRouter();

  const target = replayTarget(first(params?.crewId), first(params?.tripId), crews);
  const overview = target ? tripPath(target.crewId, target.tripId) : null;

  function replay() {
    if (!overview) return;
    if (pathname === overview) {
      tour.start();
      return;
    }
    tour.requestStart();
    router.push(overview);
  }

  return { available: tour.available && overview !== null, replay };
}
