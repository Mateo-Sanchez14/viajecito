// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREW_ID, TRIP_ID, makeTrip } from "@/features/trips/fixtures";
import { makeProposal, PROPOSAL_ID } from "@/features/proposals/test/handlers";

const order: string[] = [];
const requireMe = vi.fn();
const getProposalServer = vi.fn();
const loadTrip = vi.fn();

vi.mock("@/features/auth/server/requireMe", () => ({
  requireMe: async () => {
    order.push("requireMe");
    return requireMe();
  },
}));
vi.mock("@/features/proposals/api/proposals.server", () => ({
  getProposalServer: async (...args: unknown[]) => {
    order.push("getProposal");
    return getProposalServer(...args);
  },
}));
vi.mock("@/features/trips/server/loadTrip", () => ({
  loadTrip: async (...args: unknown[]) => loadTrip(...args),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "sessionid=abc" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ProposalPage from "./page";

const props = (tripId = TRIP_ID) => ({
  params: Promise.resolve({ crewId: CREW_ID, tripId, proposalId: PROPOSAL_ID }),
});

describe("proposal detail page", () => {
  beforeEach(() => {
    order.length = 0;
    requireMe.mockReset().mockResolvedValue({});
    getProposalServer.mockReset().mockResolvedValue(makeProposal());
    loadTrip.mockReset().mockResolvedValue(makeTrip());
  });

  it("gates on the session, then loads the proposal with the session cookie", async () => {
    const element = await ProposalPage(props());

    expect(order).toEqual(["requireMe", "getProposal"]);
    expect(getProposalServer).toHaveBeenCalledWith("sessionid=abc", PROPOSAL_ID);
    expect(element.props).toMatchObject({ proposalId: PROPOSAL_ID });
    expect(element.props.initialProposal.id).toBe(PROPOSAL_ID);
  });

  it("is a 404 for an unknown proposal", async () => {
    getProposalServer.mockResolvedValue(null);

    await expect(ProposalPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("is a 404 when the proposal belongs to another trip than the URL says", async () => {
    await expect(ProposalPage(props("99999999-9999-4999-8999-999999999999"))).rejects.toThrow("NOT_FOUND");
  });

  it("is a 404 when the trip does not have the proposals module", async () => {
    loadTrip.mockResolvedValue(makeTrip({ modules: ["dates"] }));

    await expect(ProposalPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("does not load the proposal when the session gate redirects", async () => {
    requireMe.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(ProposalPage(props())).rejects.toThrow("REDIRECT");
    expect(getProposalServer).not.toHaveBeenCalled();
  });
});
