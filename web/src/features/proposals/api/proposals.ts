import { createBrowserClient } from "@/shared/api/client";
import { ApiError, toApiError } from "@/shared/api/errors";
import type { components, paths } from "@/shared/api/schema";

type Schemas = components["schemas"];

export type Proposal = Schemas["ProposalOut"];
export type ProposalSummary = Schemas["ProposalSummaryOut"];
export type ProposalsSummary = Schemas["ProposalsSummaryOut"];
export type ProposalComment = Schemas["CommentOut"];
export type VoteTally = Schemas["VoteTallyOut"];
export type LinkPreview = Schemas["LinkPreviewOut"];
export type PersonRef = Schemas["PersonRefOut"];

// Request and error bodies are derived from the operations, not from schema names, so a
// regenerated api that names its schemas differently cannot break these types.
type JsonRequest<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody?: { content: { "application/json": infer B } };
}
  ? B
  : never;

export type ProposalCreate = JsonRequest<"/api/trips/{trip_id}/proposals", "post">;
export type ProposalPatch = JsonRequest<"/api/proposals/{proposal_id}", "patch">;
export type TransitionBody = JsonRequest<"/api/proposals/{proposal_id}/transition", "post">;
/** Body of `409 duplicate_proposal`: `{code, message, proposal_id}`. */
export type DuplicateProposalBody = paths["/api/trips/{trip_id}/proposals"]["post"]["responses"][409]["content"]["application/json"];

export type ProposalStatus = Proposal["status"];
export type Category = Proposal["category"];
export type PriceBasis = Proposal["price_basis"];
export type VoteValue = -1 | 0 | 1;
export type SortOrder = "recent" | "score";

export const CATEGORIES = [
  "lodging",
  "transport",
  "activity",
  "food",
  "gear",
  "destination",
  "other",
] as const satisfies readonly Category[];

export const STATUSES = [
  "proposed",
  "discussing",
  "chosen",
  "booked",
  "discarded",
] as const satisfies readonly ProposalStatus[];

export const PRICE_BASES = ["total", "per_person", "per_night"] as const satisfies readonly PriceBasis[];

export type ProposalFilters = {
  categories: Category[];
  statuses: ProposalStatus[];
  includeDiscarded: boolean;
  sort: SortOrder;
};

export const DEFAULT_FILTERS: ProposalFilters = {
  categories: [],
  statuses: [],
  includeDiscarded: false,
  sort: "recent",
};

export const proposalKeys = {
  root: ["proposals"] as const,
  list: (tripId: string, filters: ProposalFilters) => ["proposals", tripId, "list", filters] as const,
  summary: (tripId: string) => ["proposals", tripId, "summary"] as const,
  detail: (id: string) => ["proposals", "detail", id] as const,
  comments: (id: string) => ["proposals", "detail", id, "comments"] as const,
};

/** `409 duplicate_proposal` carries the id of the proposal that already exists (extra body field). */
export class DuplicateProposalError extends ApiError {
  constructor(
    readonly proposalId: string,
    status: number,
  ) {
    super("duplicate_proposal", status);
    this.name = "DuplicateProposalError";
  }
}

/** Unwraps an openapi-fetch result: the payload on success, an ApiError otherwise. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}

function unwrapEmpty(result: { error?: unknown; response: Response }): void {
  if (!result.response.ok) throw toApiError(result.error, result.response);
}

export async function listProposals(tripId: string, filters: ProposalFilters): Promise<ProposalSummary[]> {
  return unwrap(
    await createBrowserClient().GET("/api/trips/{trip_id}/proposals", {
      params: {
        path: { trip_id: tripId },
        query: {
          category: filters.categories.length > 0 ? filters.categories : undefined,
          status: filters.statuses.length > 0 ? filters.statuses : undefined,
          include_discarded: filters.includeDiscarded ? true : undefined,
          sort: filters.sort === "recent" ? undefined : filters.sort,
        },
      },
    }),
  );
}

export async function getProposalsSummary(tripId: string): Promise<ProposalsSummary> {
  return unwrap(
    await createBrowserClient().GET("/api/trips/{trip_id}/proposals/summary", {
      params: { path: { trip_id: tripId } },
    }),
  );
}

export async function createProposal(tripId: string, body: ProposalCreate): Promise<Proposal> {
  const result = await createBrowserClient().POST("/api/trips/{trip_id}/proposals", {
    params: { path: { trip_id: tripId } },
    body,
  });
  if (result.response.status === 409 && result.error && "proposal_id" in result.error) {
    throw new DuplicateProposalError(result.error.proposal_id, 409);
  }
  return unwrap(result as { data?: Proposal; error?: unknown; response: Response });
}

export async function getProposal(id: string): Promise<Proposal> {
  return unwrap(
    await createBrowserClient().GET("/api/proposals/{proposal_id}", {
      params: { path: { proposal_id: id } },
    }),
  );
}

export async function updateProposal(id: string, body: ProposalPatch): Promise<Proposal> {
  return unwrap(
    await createBrowserClient().PATCH("/api/proposals/{proposal_id}", {
      params: { path: { proposal_id: id } },
      body,
    }),
  );
}

export async function transitionProposal(id: string, body: TransitionBody): Promise<Proposal> {
  return unwrap(
    await createBrowserClient().POST("/api/proposals/{proposal_id}/transition", {
      params: { path: { proposal_id: id } },
      body,
    }),
  );
}

export async function castVote(id: string, value: VoteValue): Promise<VoteTally> {
  return unwrap(
    await createBrowserClient().PUT("/api/proposals/{proposal_id}/vote", {
      params: { path: { proposal_id: id } },
      body: { value },
    }),
  );
}

export async function removeVote(id: string): Promise<VoteTally> {
  return unwrap(
    await createBrowserClient().DELETE("/api/proposals/{proposal_id}/vote", {
      params: { path: { proposal_id: id } },
    }),
  );
}

export async function listComments(id: string): Promise<ProposalComment[]> {
  return unwrap(
    await createBrowserClient().GET("/api/proposals/{proposal_id}/comments", {
      params: { path: { proposal_id: id } },
    }),
  );
}

export async function addComment(id: string, body: string): Promise<ProposalComment> {
  return unwrap(
    await createBrowserClient().POST("/api/proposals/{proposal_id}/comments", {
      params: { path: { proposal_id: id } },
      body: { body },
    }),
  );
}

export async function deleteComment(commentId: string): Promise<void> {
  unwrapEmpty(
    await createBrowserClient().DELETE("/api/comments/{comment_id}", {
      params: { path: { comment_id: commentId } },
    }),
  );
}

export async function refreshPreview(id: string): Promise<void> {
  unwrapEmpty(
    await createBrowserClient().POST("/api/proposals/{proposal_id}/refresh_preview", {
      params: { path: { proposal_id: id } },
    }),
  );
}

export const thumbnailPath = (id: string) => `/api/proposals/${id}/thumbnail`;
