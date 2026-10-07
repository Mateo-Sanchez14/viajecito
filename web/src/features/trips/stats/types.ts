import type { ComponentType } from "react";

/**
 * A readiness stat card in the overview hero. `module` ties it to a trip module (it only renders
 * when the trip has that module); a stat without `module` always renders. Lower `order` first.
 */
export type TripStat = {
  key: string;
  module?: string;
  order: number;
  Component: ComponentType<{ tripId: string; crewId: string }>;
};
