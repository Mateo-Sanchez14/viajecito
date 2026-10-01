import { useQuery } from "@tanstack/react-query";
import { fetchHealth, healthQueryKey } from "../api/health";

export const HEALTH_REFETCH_INTERVAL_MS = 60_000;

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    refetchInterval: HEALTH_REFETCH_INTERVAL_MS,
  });
}
