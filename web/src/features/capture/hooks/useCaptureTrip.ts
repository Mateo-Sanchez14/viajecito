import { useQuery } from "@tanstack/react-query";
import { getTrip, tripKeys } from "@/features/trips/api/trips";

/**
 * The trip a capture is aimed at. Same key and freshness as `useTrip`, so on a trip page it is
 * already in the cache; it stays idle until there is a trip to read.
 */
export function useCaptureTrip(tripId: string | null) {
  return useQuery({
    queryKey: tripKeys.detail(tripId ?? ""),
    queryFn: () => getTrip(tripId ?? ""),
    enabled: Boolean(tripId),
    staleTime: 30_000,
  });
}
