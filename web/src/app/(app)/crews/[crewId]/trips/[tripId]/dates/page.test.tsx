// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIP_ID, makeTrip } from "@/features/trips/fixtures";

const calls: string[] = [];
const requireMe = vi.fn(async () => {
  calls.push("requireMe");
});
const loadTrip = vi.fn();
vi.mock("@/features/auth/server/requireMe", () => ({ requireMe: () => requireMe() }));
vi.mock("@/features/trips/server/loadTrip", () => ({
  loadTrip: (...args: unknown[]) => {
    calls.push("loadTrip");
    return loadTrip(...args);
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import DatesPage from "./page";

const props = { params: Promise.resolve({ crewId: "c", tripId: TRIP_ID }) };

describe("dates page", () => {
  beforeEach(() => {
    calls.length = 0;
    loadTrip.mockReset();
  });

  it("checks the session before loading anything, then renders the planner for the trip", async () => {
    loadTrip.mockResolvedValue(makeTrip());

    const element = await DatesPage(props);

    expect(calls).toEqual(["requireMe", "loadTrip"]);
    expect(element.props.tripId).toBe(TRIP_ID);
  });

  it("is a 404 when the trip has no dates module", async () => {
    loadTrip.mockResolvedValue(makeTrip({ modules: ["proposals"] }));

    await expect(DatesPage(props)).rejects.toThrow("NOT_FOUND");
  });

  it("is a 404 when the trip cannot be loaded", async () => {
    loadTrip.mockResolvedValue(null);

    await expect(DatesPage(props)).rejects.toThrow("NOT_FOUND");
  });
});
