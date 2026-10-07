"use client";

import { useDocuments } from "@/features/documents/hooks/useDocuments";
import { useClientNow } from "@/shared/lib/useClientNow";
import { useTripContext } from "../TripProvider";
import { ActionRow } from "./ActionRow";
import { documentsNone } from "./logic";
import type { TripAction } from "./types";

/** Rule: no documents and the trip leaves within a month. The clock is client-only, so SSR renders nothing. */
export const DocumentsNoneAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { trip } = useTripContext();
  const now = useClientNow();
  const { data, isPending, isError } = useDocuments(tripId);
  if (isPending || isError || !now) return null;
  const item = documentsNone(data.length, trip.start_on, trip.timezone, now);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
