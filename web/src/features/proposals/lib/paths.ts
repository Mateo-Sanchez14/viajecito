import { sectionPath } from "@/features/trips/lib/paths";

export const proposalsPath = (crewId: string, tripId: string) => sectionPath(crewId, tripId, "proposals");

export const proposalPath = (crewId: string, tripId: string, proposalId: string) =>
  `${proposalsPath(crewId, tripId)}/${proposalId}`;
