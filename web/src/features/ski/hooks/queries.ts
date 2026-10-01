import { useQuery } from "@tanstack/react-query";
import {
  getSkiConditions,
  getSkiOverview,
  getSkiProfile,
  listResorts,
  skiKeys,
  type Country,
} from "../api/ski";

/** Everything the ski page shows; polled every minute. */
export function useSkiOverview(tripId: string) {
  return useQuery({
    queryKey: skiKeys.overview(tripId),
    queryFn: () => getSkiOverview(tripId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** The cheap conditions-only read, shared with the Today page (M4); polled every 5 minutes. */
export function useSkiConditions(tripId: string) {
  return useQuery({
    queryKey: skiKeys.conditions(tripId),
    queryFn: () => getSkiConditions(tripId),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}

/** The seeded resort catalog; it barely changes, so it is cached for an hour. */
export function useResorts(country?: Country) {
  return useQuery({
    queryKey: skiKeys.resorts(country),
    queryFn: () => listResorts(country),
    staleTime: 60 * 60_000,
  });
}

/** My own ski profile (defaults when I never saved one). */
export function useSkiProfile() {
  return useQuery({ queryKey: skiKeys.profile(), queryFn: getSkiProfile });
}
