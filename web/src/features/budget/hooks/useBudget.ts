import { useQuery } from "@tanstack/react-query";
import { getBudget } from "../api/budget";
export function useBudget(tripId: string) {
  return useQuery({
    queryKey: ["budget", tripId],
    queryFn: () => getBudget(tripId),
    refetchInterval: 60_000,
  });
}
