import type { ComponentType } from "react";

/**
 * A card on the trip overview. `module` ties it to a trip module: it only renders when the
 * trip has that module. A card without `module` always renders. Lower `order` comes first.
 */
export type TripCard = {
  key: string;
  module?: string;
  order: number;
  Component: ComponentType<{ tripId: string; crewId: string }>;
};
