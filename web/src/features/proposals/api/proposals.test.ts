import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import { TRIP_ID } from "@/features/trips/fixtures";
import { makeComment, makeProposal, makeSummary, PROPOSAL_ID } from "../test/handlers";
import {
  addComment,
  castVote,
  createProposal,
  DEFAULT_FILTERS,
  DuplicateProposalError,
  listComments,
  listProposals,
  proposalKeys,
  removeVote,
  transitionProposal,
} from "./proposals";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));

describe("proposals api", () => {
  afterEach(() => resetCsrfToken());

  it("sends repeated category/status params and only non-default flags", async () => {
    let search = "";
    server.use(
      http.get("/api/trips/{trip_id}/proposals", ({ request, response }) => {
        search = new URL(request.url).search;
        return response(200).json([makeSummary()]);
      }),
    );

    await listProposals(TRIP_ID, {
      categories: ["lodging", "food"],
      statuses: ["chosen"],
      includeDiscarded: true,
      sort: "score",
    });

    const params = new URLSearchParams(search);
    expect(params.getAll("category")).toEqual(["lodging", "food"]);
    expect(params.getAll("status")).toEqual(["chosen"]);
    expect(params.get("include_discarded")).toBe("true");
    expect(params.get("sort")).toBe("score");
  });

  it("omits every param for the default filters", async () => {
    let search = "?";
    server.use(
      http.get("/api/trips/{trip_id}/proposals", ({ request, response }) => {
        search = new URL(request.url).search;
        return response(200).json([]);
      }),
    );

    await listProposals(TRIP_ID, DEFAULT_FILTERS);

    expect(search).toBe("");
  });

  it("turns a 409 duplicate_proposal into an error carrying the existing proposal id", async () => {
    server.use(
      csrf,
      http.post("/api/trips/{trip_id}/proposals", () =>
        HttpResponse.json(
          { code: "duplicate_proposal", message: "x", proposal_id: PROPOSAL_ID },
          { status: 409 },
        ),
      ),
    );

    const error = await createProposal(TRIP_ID, { url: "https://example.com/x" }).catch((e) => e);

    expect(error).toBeInstanceOf(DuplicateProposalError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("duplicate_proposal");
    expect(error.proposalId).toBe(PROPOSAL_ID);
  });

  it("surfaces other failures as an ApiError with the body's code", async () => {
    server.use(
      csrf,
      http.post("/api/proposals/{proposal_id}/transition", ({ response }) =>
        response(409).json({ code: "invalid_transition", message: "x" }),
      ),
    );

    await expect(transitionProposal(PROPOSAL_ID, { to: "booked" })).rejects.toMatchObject({
      code: "invalid_transition",
      status: 409,
    });
  });

  it("casts, removes and lists through the typed client", async () => {
    const tally = makeProposal().tally;
    let voted: unknown = null;
    server.use(
      csrf,
      http.put("/api/proposals/{proposal_id}/vote", async ({ request, response }) => {
        voted = await request.json();
        return response(200).json(tally);
      }),
      http.delete("/api/proposals/{proposal_id}/vote", ({ response }) => response(200).json(tally)),
      http.get("/api/proposals/{proposal_id}/comments", ({ response }) =>
        response(200).json([makeComment()]),
      ),
      http.post("/api/proposals/{proposal_id}/comments", ({ response }) =>
        response(201).json(makeComment({ body: "hola" })),
      ),
    );

    await expect(castVote(PROPOSAL_ID, 1)).resolves.toEqual(tally);
    expect(voted).toEqual({ value: 1 });
    await expect(removeVote(PROPOSAL_ID)).resolves.toEqual(tally);
    await expect(listComments(PROPOSAL_ID)).resolves.toHaveLength(1);
    await expect(addComment(PROPOSAL_ID, "hola")).resolves.toMatchObject({ body: "hola" });
  });

  it("builds the documented query keys", () => {
    expect(proposalKeys.list(TRIP_ID, DEFAULT_FILTERS)).toEqual(["proposals", TRIP_ID, "list", DEFAULT_FILTERS]);
    expect(proposalKeys.summary(TRIP_ID)).toEqual(["proposals", TRIP_ID, "summary"]);
    expect(proposalKeys.detail(PROPOSAL_ID)).toEqual(["proposals", "detail", PROPOSAL_ID]);
    expect(proposalKeys.comments(PROPOSAL_ID)).toEqual(["proposals", "detail", PROPOSAL_ID, "comments"]);
  });
});
