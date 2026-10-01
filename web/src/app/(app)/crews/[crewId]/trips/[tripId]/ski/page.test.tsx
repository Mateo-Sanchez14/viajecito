// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIP_ID } from "@/features/trips/fixtures";
import { SkiDashboard } from "@/features/ski/containers/SkiDashboard";

const calls: string[] = [];
const requireMe = vi.fn(async () => {
  calls.push("requireMe");
});
vi.mock("@/features/auth/server/requireMe", () => ({ requireMe: () => requireMe() }));

import SkiPage from "./page";

describe("ski page", () => {
  beforeEach(() => {
    calls.length = 0;
    requireMe.mockClear();
  });

  it("gates on the session first, then renders the dashboard for the trip", async () => {
    const element = await SkiPage({ params: Promise.resolve({ crewId: "c", tripId: TRIP_ID }) });

    expect(calls).toEqual(["requireMe"]);
    expect(element.type).toBe(SkiDashboard);
    expect(element.props.tripId).toBe(TRIP_ID);
  });
});
