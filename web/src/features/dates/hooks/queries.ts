import { queryOptions, useQuery } from "@tanstack/react-query";
import { datesKeys, getAvailability, listDecisions } from "../api/dates";

/** Freshness is by polling, not push: both reads refetch every minute while the tab is visible. */
export const POLL_INTERVAL_MS = 60_000;

export function decisionsQueryOptions(tripId: string) {
  return queryOptions({
    queryKey: datesKeys.decisions(tripId),
    queryFn: () => listDecisions(tripId),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** `paused` stops polling while a local edit is pending, so a refetch never overwrites it. */
export function availabilityQueryOptions(decisionId: string, { paused = false } = {}) {
  return queryOptions({
    queryKey: datesKeys.availability(decisionId),
    queryFn: () => getAvailability(decisionId),
    refetchInterval: paused ? false : POLL_INTERVAL_MS,
  });
}

/** The trip's decisions, newest first. */
export function useDecisions(tripId: string) {
  return useQuery(decisionsQueryOptions(tripId));
}

/** The availability grid, best windows and non-responders of one decision. */
export function useAvailability(decisionId: string, options?: { paused?: boolean }) {
  return useQuery(availabilityQueryOptions(decisionId, options));
}
