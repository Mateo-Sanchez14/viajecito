"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToday, itineraryKeys } from "@/features/itinerary/api/itinerary";
export const TODAY_INTERVAL = 20_000;
export function useToday(tripId: string) {
  const cache = useQueryClient();
  const key = itineraryKeys.today(tripId);
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      getToday(
        tripId,
        cache.getQueryData<Awaited<ReturnType<typeof getToday>>>(key),
        signal,
      ),
    select: (snapshot) => snapshot.data,
    refetchInterval: TODAY_INTERVAL,
  });
}
