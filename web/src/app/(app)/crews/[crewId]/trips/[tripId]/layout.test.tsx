// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREW_ID, TRIP_ID, makeTrip } from "@/features/trips/fixtures";

const requireMe = vi.fn();
const getTripServer = vi.fn();
const order: string[] = [];

vi.mock("@/features/auth/server/requireMe", () => ({
  requireMe: async () => {
    order.push("requireMe");
    return requireMe();
  },
}));
vi.mock("@/features/trips/api/trips.server", () => ({
  getTripServer: async (...args: unknown[]) => {
    order.push("getTrip");
    return getTripServer(...args);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "sessionid=abc" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import TripLayout from "./layout";

const props = (crewId = CREW_ID) => ({
  children: "child",
  params: Promise.resolve({ crewId, tripId: TRIP_ID }),
});

describe("trip layout", () => {
  beforeEach(() => {
    order.length = 0;
    requireMe.mockReset().mockResolvedValue({});
    getTripServer.mockReset();
  });

  it("gates on the session first, then loads the trip with the session cookie", async () => {
    getTripServer.mockResolvedValue(makeTrip());

    const element = await TripLayout(props());

    expect(order).toEqual(["requireMe", "getTrip"]);
    expect(getTripServer).toHaveBeenCalledWith("sessionid=abc", TRIP_ID);
    expect(element.props.trip.id).toBe(TRIP_ID);
  });

  it("renders notFound() when the api answers 404", async () => {
    getTripServer.mockResolvedValue(null);

    await expect(TripLayout(props())).rejects.toThrow("NOT_FOUND");
  });

  it("renders notFound() when the trip belongs to another crew than the URL says", async () => {
    getTripServer.mockResolvedValue(makeTrip());

    await expect(TripLayout(props("99999999-9999-4999-8999-999999999999"))).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("does not load the trip when the session gate redirects", async () => {
    requireMe.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(TripLayout(props())).rejects.toThrow("REDIRECT");
    expect(getTripServer).not.toHaveBeenCalled();
  });
});
