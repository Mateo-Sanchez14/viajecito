import type { Me } from "@/features/auth/MeProvider";

export type CrewSummary = Me["crews"][number];

export type CaptureOption = { crewId: string; crewName: string; tripId: string };

export type CaptureTarget =
  | { kind: "trip"; tripId: string; crewId?: string }
  | { kind: "choose"; options: CaptureOption[] }
  | { kind: "none" };

/**
 * Where a quick capture lands. Inside a trip the route decides. Anywhere else (home) it is the
 * default trip of each crew: one is used as is, several must be chosen by the person, none means
 * there is nothing to add to. It never guesses between several.
 */
export function resolveCaptureTarget(
  routeTripId: string | undefined,
  crews: CrewSummary[],
  routeCrewId?: string,
): CaptureTarget {
  if (routeTripId) return { kind: "trip", tripId: routeTripId, crewId: routeCrewId };

  const options = crews.flatMap((crew) =>
    crew.default_trip_id ? [{ crewId: crew.id, crewName: crew.name, tripId: crew.default_trip_id }] : [],
  );
  if (options.length === 0) return { kind: "none" };
  if (options.length === 1) return { kind: "trip", tripId: options[0].tripId, crewId: options[0].crewId };
  return { kind: "choose", options };
}
