// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREW_ID, TRIP_ID, makeTrip } from "@/features/trips/fixtures";

const order: string[] = [];
const requireMe = vi.fn();
const loadTrip = vi.fn();

vi.mock("@/features/auth/server/requireMe", () => ({
  requireMe: async () => {
    order.push("requireMe");
    return requireMe();
  },
}));
vi.mock("@/features/trips/server/loadTrip", () => ({
  loadTrip: async (...args: unknown[]) => {
    order.push("loadTrip");
    return loadTrip(...args);
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ProposalsPage from "./page";

const props = () => ({ params: Promise.resolve({ crewId: CREW_ID, tripId: TRIP_ID }) });

describe("proposals page", () => {
  beforeEach(() => {
    order.length = 0;
    requireMe.mockReset().mockResolvedValue({});
    loadTrip.mockReset().mockResolvedValue(makeTrip());
  });

  it("gates on the session first and renders the board for the trip", async () => {
    const element = await ProposalsPage(props());

    expect(order[0]).toBe("requireMe");
    expect(element.props).toMatchObject({ tripId: TRIP_ID, crewId: CREW_ID });
  });

  it("is a 404 when the trip does not have the proposals module", async () => {
    loadTrip.mockResolvedValue(makeTrip({ modules: ["dates"] }));

    await expect(ProposalsPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("is a 404 when the trip cannot be loaded", async () => {
    loadTrip.mockResolvedValue(null);

    await expect(ProposalsPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("does not load anything when the session gate redirects", async () => {
    requireMe.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(ProposalsPage(props())).rejects.toThrow("REDIRECT");
    expect(loadTrip).not.toHaveBeenCalled();
  });
});
