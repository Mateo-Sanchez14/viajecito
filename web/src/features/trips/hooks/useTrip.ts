import { useQuery } from "@tanstack/react-query";
import { getTrip, tripKeys, type Trip } from "../api/trips";

/** One trip; pass `initialData` when a server component already fetched it. */
export function useTrip(tripId: string, initialData?: Trip) {
  return useQuery({
    queryKey: tripKeys.detail(tripId),
    queryFn: () => getTrip(tripId),
    initialData,
    staleTime: 30_000,
  });
}
