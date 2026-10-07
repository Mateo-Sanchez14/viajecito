"use client";

import { useBudget } from "@/features/budget/hooks/useBudget";
import { ActionRow } from "./ActionRow";
import { missingPrice } from "./logic";
import type { TripAction } from "./types";

/** Rule: chosen proposals without a price. Shares the budget query with the budget card. */
export const MissingPriceAction: TripAction["Component"] = ({ tripId, crewId }) => {
  const { data, isPending, isError } = useBudget(tripId);
  if (isPending || isError) return null;
  const item = missingPrice(data.missing_price);
  return item ? <ActionRow item={item} tripId={tripId} crewId={crewId} /> : null;
};
