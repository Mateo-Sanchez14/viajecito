"use client";
import { useQuery } from "@tanstack/react-query";
import { getMapProposals } from "../api/proposals";
export const mapProposalKey = (tripId: string) =>
  ["proposals", tripId, "list", { map: true }] as const;
export function useMapProposals(tripId: string) {
  return useQuery({
    queryKey: mapProposalKey(tripId),
    queryFn: ({ signal }) => getMapProposals(tripId, signal),
    refetchInterval: 60_000,
  });
}
