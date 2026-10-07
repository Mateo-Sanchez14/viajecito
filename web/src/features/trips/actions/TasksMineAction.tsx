"use client";

import { useTasks } from "@/features/logistics/hooks/queries";
import { useTripContext } from "../TripProvider";
import { ActionRow } from "./ActionRow";
import { tasksMine } from "./logic";
import type { TripAction } from "./types";

/** Rule: my open tasks, unless some task is overdue (that row speaks alone). */
export const TasksMineAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { me } = useTripContext();
  const { data, isPending, isError } = useTasks(tripId);
  if (isPending || isError) return null;
  const item = tasksMine(data, me.person.id);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
