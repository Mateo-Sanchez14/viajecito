"use client";

import { useTripContext } from "../TripProvider";
import { ActionRow } from "./ActionRow";
import { rsvpOthers } from "./logic";
import type { TripAction } from "./types";

/** Rule: other people have not answered yet. Reads the participants already in context. */
export const RsvpOthersAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { participants, me } = useTripContext();
  const item = rsvpOthers(participants, me.person.id);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
