"use client";

import { useDecisions } from "@/features/dates/hooks/queries";
import { useTripContext } from "../TripProvider";
import { ActionRow } from "./ActionRow";
import { datesAction } from "./logic";
import type { TripAction } from "./types";

/** Rule: no departure day yet (vote if a dates vote is open). Nothing while the decisions load or fail. */
export const DatesAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { trip } = useTripContext();
  const { data, isPending, isError } = useDecisions(tripId);
  if (isPending || isError) return null;
  const item = datesAction(trip.start_on, data);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
