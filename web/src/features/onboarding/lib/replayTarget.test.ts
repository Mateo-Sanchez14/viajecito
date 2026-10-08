import { describe, expect, it } from "vitest";
import type { CrewSummary } from "@/features/capture/lib/target";
import { replayTarget } from "./replayTarget";

const crew = (id: string, defaultTripId: string | null): CrewSummary => ({
  id,
  name: id,
  role: "member",
  gastito_group_url: null,
  default_trip_id: defaultTripId,
});

describe("replayTarget", () => {
  it("prefers the trip on screen", () => {
    expect(replayTarget("c1", "t1", [crew("c2", "t2")])).toEqual({ crewId: "c1", tripId: "t1" });
  });

  it("falls back to the default trip of the first crew that has one, in /api/me order", () => {
    expect(replayTarget(undefined, undefined, [crew("a", null), crew("b", "d1"), crew("c", "d2")])).toEqual({
      crewId: "b",
      tripId: "d1",
    });
  });

  it("is null with no trip on screen and no default trip", () => {
    expect(replayTarget(undefined, undefined, [crew("a", null)])).toBeNull();
    expect(replayTarget(undefined, undefined, [])).toBeNull();
  });

  it("does not trust a half route (a trip without its crew)", () => {
    expect(replayTarget(undefined, "t1", [crew("a", "d1")])).toEqual({ crewId: "a", tripId: "d1" });
  });
});
