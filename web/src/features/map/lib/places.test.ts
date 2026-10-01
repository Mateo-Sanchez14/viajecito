import { expect, it } from "vitest";
import { makeSummary, makePreview } from "@/features/proposals/test/handlers";
import { mapPlaces, proposalPath } from "./places";
it("maps only finite, valid coordinates and retains zero values", () => {
  const proposals = [
    makeSummary({ id: "zero", preview: makePreview({ lat: 0, lng: 0 }) }),
    makeSummary({
      id: "valid",
      preview: makePreview({ lat: -41.12, lng: -71.2 }),
    }),
    makeSummary({ id: "missing" }),
    makeSummary({ id: "partial", preview: makePreview({ lat: 4, lng: null }) }),
    makeSummary({ id: "invalid", preview: makePreview({ lat: 91, lng: 10 }) }),
    makeSummary({
      id: "nan",
      preview: makePreview({ lat: Number.NaN, lng: 10 }),
    }),
  ];
  expect(mapPlaces(proposals).map((place) => place.proposal.id)).toEqual([
    "zero",
    "valid",
  ]);
  expect(mapPlaces(proposals)[0].position).toEqual([0, 0]);
});
it("builds a same-origin detail path from the current route rather than trusting web_path", () => {
  expect(proposalPath("crew", "trip", "id")).toBe(
    "/crews/crew/trips/trip/proposals/id",
  );
  expect(proposalPath("crew", "trip", "id/escape")).toContain("id%2Fescape");
});
