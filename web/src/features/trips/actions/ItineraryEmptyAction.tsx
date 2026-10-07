"use client";

import { useItinerary } from "@/features/itinerary/hooks/queries";
import { useTripContext } from "../TripProvider";
import { ActionRow } from "./ActionRow";
import { itineraryEmpty } from "./logic";
import type { TripAction } from "./types";

/** Rule: a dated trip with an empty itinerary. Shares the itinerary query with the itinerary card. */
export const ItineraryEmptyAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { trip } = useTripContext();
  const { data, isPending, isError } = useItinerary(tripId);
  if (isPending || isError) return null;
  const item = itineraryEmpty(data, trip.start_on);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
