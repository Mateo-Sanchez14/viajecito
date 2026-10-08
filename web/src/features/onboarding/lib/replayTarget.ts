import type { CrewSummary } from "@/features/capture/lib/target";

export type ReplayTarget = { crewId: string; tripId: string };

/**
 * The trip whose overview the tour replays on: the one on screen, else the default trip of the first
 * crew (in `/api/me` order) that has one, else nothing (the replay entry then stays hidden).
 */
export function replayTarget(
  routeCrewId: string | undefined,
  routeTripId: string | undefined,
  crews: CrewSummary[],
): ReplayTarget | null {
  if (routeCrewId && routeTripId) return { crewId: routeCrewId, tripId: routeTripId };
  const crew = crews.find((candidate) => candidate.default_trip_id);
  return crew?.default_trip_id ? { crewId: crew.id, tripId: crew.default_trip_id } : null;
}
