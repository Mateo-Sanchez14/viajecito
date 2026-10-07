"use client";

import { useTripContext } from "../TripProvider";
import { ActionRow } from "./ActionRow";
import { rsvpMine } from "./logic";
import type { TripAction } from "./types";

/** Rule: I have not said whether I am going. Reads the trip already in context. */
export const RsvpMineAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { myRsvp } = useTripContext();
  const item = rsvpMine(myRsvp);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
