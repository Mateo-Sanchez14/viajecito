"use client";

import { useQueries } from "@tanstack/react-query";
import { useMe } from "@/features/auth/MeProvider";
import { useClientNow } from "@/shared/lib/useClientNow";
import { listTrips, tripKeys } from "../api/trips";
import { pickNextTrip } from "../lib/nextTrip";

/**
 * The trips of every crew the person is in, plus the one the home features (the same pick the hero
 * shows). The queries share their keys with the crew lists, so the home costs one request per crew.
 * `picked` is `undefined` while it cannot be known yet, `null` when nothing qualifies.
 */
export function useHomeTrips() {
  const { crews } = useMe();
  const now = useClientNow();
  const results = useQueries({
    queries: crews.map((crew) => ({ queryKey: tripKeys.crew(crew.id), queryFn: () => listTrips(crew.id) })),
  });
  const pending = results.some((result) => result.isPending);
  const failed = results.some((result) => result.isError);

  const defaults = new Set(crews.flatMap((crew) => (crew.default_trip_id ? [crew.default_trip_id] : [])));
  const ready = crews.length > 0 && !pending && !failed && now !== null;
  const picked = ready
    ? pickNextTrip(
        crews.map((crew, index) => ({ crewId: crew.id, trips: results[index].data ?? [] })),
        defaults,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        now,
      )
    : undefined;

  return { crews, now, results, pending, failed, picked };
}
