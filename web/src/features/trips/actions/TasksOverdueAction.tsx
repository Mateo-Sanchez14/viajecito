"use client";

import { useTasks } from "@/features/logistics/hooks/queries";
import { ActionRow } from "./ActionRow";
import { tasksOverdue } from "./logic";
import type { TripAction } from "./types";

/** Rule: open tasks past their due day. Shares the tasks query with the stats and the logistics card. */
export const TasksOverdueAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { data, isPending, isError } = useTasks(tripId);
  if (isPending || isError) return null;
  const item = tasksOverdue(data);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
