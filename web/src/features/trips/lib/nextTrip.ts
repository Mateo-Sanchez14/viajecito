import { type Countdown, tripCountdown } from "./countdown";
import type { TripSummary } from "../api/trips";

type Featured = { crewId: string; trip: TripSummary; countdown: Countdown };

/** Ongoing and leaving-today trips come first, then upcoming ones; the earliest start wins inside each. */
const RANK = { ongoing: 0, today: 0, upcoming: 1 } as const;

/**
 * The trip the home hero features, chosen from trips already fetched for the person's crews: not
 * `done`, with a start date, not finished. Ongoing wins over upcoming; then the earliest start;
 * ties prefer a crew's default trip, then the name, then the id. `null` when nothing qualifies.
 */
export function pickNextTrip(
  byCrew: { crewId: string; trips: TripSummary[] }[],
  defaultTripIds: ReadonlySet<string>,
  timeZone: string,
  now: Date,
): Featured | null {
  const candidates: Featured[] = [];
  for (const { crewId, trips } of byCrew) {
    for (const trip of trips) {
      if (trip.status === "done" || !trip.start_on) continue;
      const countdown = tripCountdown(trip.start_on, trip.end_on, timeZone, now);
      if (countdown.kind === "done" || countdown.kind === "undated") continue;
      candidates.push({ crewId, trip, countdown });
    }
  }

  const rank = (candidate: Featured) => RANK[candidate.countdown.kind as keyof typeof RANK];
  candidates.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    // ISO dates compare chronologically as strings; start_on is non-null here.
    const byStart = (a.trip.start_on ?? "").localeCompare(b.trip.start_on ?? "");
    if (byStart !== 0) return byStart;
    const aDefault = defaultTripIds.has(a.trip.id) ? 0 : 1;
    const bDefault = defaultTripIds.has(b.trip.id) ? 0 : 1;
    if (aDefault !== bDefault) return aDefault - bDefault;
    return a.trip.name.localeCompare(b.trip.name) || a.trip.id.localeCompare(b.trip.id);
  });

  return candidates[0] ?? null;
}
