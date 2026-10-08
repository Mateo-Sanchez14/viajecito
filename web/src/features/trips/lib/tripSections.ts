import { type Countdown, tripCountdown } from "./countdown";
import type { TripSummary } from "../api/trips";

export type SectionEntry = {
  trip: TripSummary;
  /** `null` until the client clock is known (server markup): no countdown is claimed without it. */
  countdown: Countdown | null;
};

export type TripSections = {
  /** Ongoing, leaving today and dated upcoming trips: soonest first. */
  upcoming: SectionEntry[];
  /** Trips without a start date, in the order the api returned them. */
  undated: SectionEntry[];
  /** Finished trips, most recent first. */
  past: SectionEntry[];
};

const isLive = (entry: SectionEntry) =>
  entry.countdown?.kind === "ongoing" || entry.countdown?.kind === "today";

/**
 * Groups a crew's trips for the home: what is coming (or happening), what has no date yet and what
 * is over. Without `now` nothing can be classed as over by date, so dated trips are all "upcoming";
 * a trip marked `done` is always past. Ongoing trips lead the upcoming group, then the soonest start.
 */
export function groupTrips(
  trips: readonly TripSummary[],
  now: Date | null,
  timeZone: string,
): TripSections {
  const sections: TripSections = { upcoming: [], undated: [], past: [] };

  for (const trip of trips) {
    const countdown = now ? tripCountdown(trip.start_on, trip.end_on, timeZone, now) : null;
    const entry: SectionEntry = { trip, countdown };
    if (trip.status === "done" || countdown?.kind === "done") sections.past.push(entry);
    else if (!trip.start_on) sections.undated.push(entry);
    else sections.upcoming.push(entry);
  }

  // ISO dates compare chronologically as strings.
  const start = (entry: SectionEntry) => entry.trip.start_on ?? "";
  sections.upcoming.sort((a, b) => {
    if (isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
    return start(a).localeCompare(start(b)) || a.trip.name.localeCompare(b.trip.name) || a.trip.id.localeCompare(b.trip.id);
  });
  const finished = (entry: SectionEntry) => entry.trip.end_on ?? entry.trip.start_on ?? "";
  sections.past.sort(
    (a, b) => finished(b).localeCompare(finished(a)) || a.trip.name.localeCompare(b.trip.name) || a.trip.id.localeCompare(b.trip.id),
  );

  return sections;
}
