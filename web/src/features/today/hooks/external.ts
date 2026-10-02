"use client";
import { useQuery } from "@tanstack/react-query";
import { getDocuments, getSnow } from "../api/external";
export function useTripDocuments(tripId: string) {
  return useQuery({
    queryKey: ["documents", tripId, "list", "all"],
    queryFn: ({ signal }) => getDocuments(tripId, signal),
    refetchInterval: 60_000,
  });
}
export function useSkiConditions(tripId: string) {
  return useQuery({
    queryKey: ["ski", tripId, "conditions"],
    queryFn: () => getSnow(tripId),
    refetchInterval: 300_000,
  });
}
