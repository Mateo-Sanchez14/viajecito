"use client";
import { useQuery } from "@tanstack/react-query";
import { getItinerary, getNotes, itineraryKeys } from "../api/itinerary";
export function useItinerary(tripId: string) {
  return useQuery({
    queryKey: itineraryKeys.detail(tripId),
    queryFn: () => getItinerary(tripId),
    refetchInterval: 60_000,
  });
}
export function useNotes(tripId: string, onToday = false) {
  return useQuery({
    queryKey: itineraryKeys.notes(tripId),
    queryFn: () => getNotes(tripId),
    refetchInterval: onToday ? 20_000 : 60_000,
  });
}
