// @vitest-environment node
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { makeProposal, PROPOSAL_ID } from "../test/handlers";
import { getProposalServer } from "./proposals.server";

const url = `http://localhost:8000/api/proposals/${PROPOSAL_ID}`;

describe("getProposalServer", () => {
  it("forwards the session cookie and returns the proposal", async () => {
    let cookie: string | null = null;
    server.use(
      http.get(url, ({ request }) => {
        cookie = request.headers.get("cookie");
        return HttpResponse.json(makeProposal());
      }),
    );

    const proposal = await getProposalServer("sessionid=abc", PROPOSAL_ID);

    expect(proposal?.id).toBe(PROPOSAL_ID);
    expect(cookie).toBe("sessionid=abc");
  });

  it("returns null on 404 so the page can render notFound()", async () => {
    server.use(http.get(url, () => HttpResponse.json({ code: "not_found", message: "x" }, { status: 404 })));

    await expect(getProposalServer("sessionid=abc", PROPOSAL_ID)).resolves.toBeNull();
  });

  it("throws on any other failure instead of pretending the proposal is missing", async () => {
    server.use(http.get(url, () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })));

    await expect(getProposalServer("sessionid=abc", PROPOSAL_ID)).rejects.toThrow(/500/);
  });
});
