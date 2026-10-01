import type { MapProposal } from "../api/proposals";
export type MapPlace = {
  proposal: MapProposal;
  position: [number, number];
  number: number;
};
export type Category = MapProposal["category"];
export const categoryColors: Record<Category, string> = {
  lodging: "#7c3aed",
  transport: "#0369a1",
  activity: "#047857",
  food: "#b45309",
  gear: "#be185d",
  destination: "#334155",
  other: "#57534e",
};
/** Match marker numbering to the fallback list; missing locations still keep their place in it. */
export function mapPlaces(proposals: MapProposal[]): MapPlace[] {
  return proposals.flatMap((proposal, index) => {
    const lat = proposal.preview?.lat;
    const lng = proposal.preview?.lng;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      return [];
    return [{ proposal, position: [lat, lng], number: index + 1 }];
  });
}
export function proposalPath(crewId: string, tripId: string, id: string) {
  return `/crews/${encodeURIComponent(crewId)}/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(id)}`;
}
