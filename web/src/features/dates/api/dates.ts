import { createBrowserClient } from "@/shared/api/client";
import { toApiError } from "@/shared/api/errors";
import type { components } from "@/shared/api/schema";

type Schemas = components["schemas"];

export type Decision = Schemas["DecisionOut"];
export type DecisionCreate = Schemas["DecisionCreateIn"];
export type DecisionPatch = Schemas["DecisionPatchIn"];
export type Availability = Schemas["AvailabilityOut"];
export type AvailabilityAnswer = Schemas["AvailabilityAnswerIn"];
export type CloseDecisionBody = Schemas["CloseDecisionIn"];
export type BestWindow = Schemas["WindowOut"];
export type GridPerson = Schemas["GridPersonOut"];
export type PersonRef = Schemas["PersonRefOut"];

export const datesKeys = {
  decisions: (tripId: string) => ["dates", tripId, "decisions"] as const,
  availability: (decisionId: string) => ["dates", "decision", decisionId, "availability"] as const,
};

/** Unwraps an openapi-fetch result: the payload on success, an ApiError otherwise. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}

export async function listDecisions(tripId: string): Promise<Decision[]> {
  return unwrap(
    await createBrowserClient().GET("/api/trips/{trip_id}/decisions", {
      params: { path: { trip_id: tripId } },
    }),
  );
}

export async function openDecision(tripId: string, body: DecisionCreate): Promise<Decision> {
  return unwrap(
    await createBrowserClient().POST("/api/trips/{trip_id}/decisions", {
      params: { path: { trip_id: tripId } },
      body,
    }),
  );
}

export async function updateDecision(decisionId: string, body: DecisionPatch): Promise<Decision> {
  return unwrap(
    await createBrowserClient().PATCH("/api/decisions/{decision_id}", {
      params: { path: { decision_id: decisionId } },
      body,
    }),
  );
}

export async function getAvailability(decisionId: string): Promise<Availability> {
  return unwrap(
    await createBrowserClient().GET("/api/decisions/{decision_id}/availability", {
      params: { path: { decision_id: decisionId } },
    }),
  );
}

/** Writes my answers only; a `null` answer clears the day. The api never reads a person id from the body. */
export async function setAvailability(
  decisionId: string,
  answers: AvailabilityAnswer[],
): Promise<Availability> {
  return unwrap(
    await createBrowserClient().PUT("/api/decisions/{decision_id}/availability", {
      params: { path: { decision_id: decisionId } },
      body: { answers },
    }),
  );
}

export async function closeDecision(decisionId: string, body: CloseDecisionBody): Promise<Decision> {
  return unwrap(
    await createBrowserClient().POST("/api/decisions/{decision_id}/close", {
      params: { path: { decision_id: decisionId } },
      body,
    }),
  );
}

export async function reopenDecision(decisionId: string): Promise<Decision> {
  return unwrap(
    await createBrowserClient().POST("/api/decisions/{decision_id}/reopen", {
      params: { path: { decision_id: decisionId } },
    }),
  );
}
