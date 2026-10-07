import { describe, expect, it } from "vitest";
import { resolveCaptureTarget, type CrewSummary } from "./target";

const crew = (id: string, defaultTripId: string | null): CrewSummary => ({
  id,
  name: `Crew ${id}`,
  role: "member",
  gastito_group_url: null,
  default_trip_id: defaultTripId,
});

describe("resolveCaptureTarget", () => {
  it("uses the trip of the route and ignores the crews' defaults", () => {
    expect(resolveCaptureTarget("T1", [crew("c1", "D1"), crew("c2", "D2")], "c1")).toEqual({
      kind: "trip",
      tripId: "T1",
      crewId: "c1",
    });
  });

  it("uses the only default trip on home", () => {
    expect(resolveCaptureTarget(undefined, [crew("c1", null), crew("c2", "D2")])).toEqual({
      kind: "trip",
      tripId: "D2",
      crewId: "c2",
    });
  });

  it("asks which one when several crews have a default trip", () => {
    expect(resolveCaptureTarget(undefined, [crew("c1", "D1"), crew("c2", "D2"), crew("c3", null)])).toEqual({
      kind: "choose",
      options: [
        { crewId: "c1", crewName: "Crew c1", tripId: "D1" },
        { crewId: "c2", crewName: "Crew c2", tripId: "D2" },
      ],
    });
  });

  it("has no target when no crew has a default trip, or there are no crews", () => {
    expect(resolveCaptureTarget(undefined, [crew("c1", null)])).toEqual({ kind: "none" });
    expect(resolveCaptureTarget(undefined, [])).toEqual({ kind: "none" });
  });
});
