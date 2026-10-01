import { createBrowserClient } from "@/shared/api/client";
import { toApiError } from "@/shared/api/errors";
import type { components } from "@/shared/api/schema";
/** M3 contract output until its real generated type is integrated. */
export type Document = {
  id: string;
  trip_id: string;
  title: string;
  kind: "ticket" | "reservation" | "insurance" | "id" | "photo" | "other";
  mime: string;
  size: number;
  visibility: "crew" | "owner_only";
  owner: components["schemas"]["PersonRefOut"] | null;
  uploader: components["schemas"]["PersonRefOut"];
  valid_until: string | null;
  proposal_id: string | null;
  created_at: string;
  download_path: string;
  can_delete: boolean;
};
export type SkiConditions = components["schemas"]["SkiConditionsOut"];
export async function getDocuments(
  tripId: string,
  signal?: AbortSignal,
): Promise<Document[]> {
  const response = await fetch(
    new URL(
      `/api/trips/${encodeURIComponent(tripId)}/documents`,
      globalThis.location.origin,
    ),
    { credentials: "same-origin", signal },
  );
  if (!response.ok)
    throw toApiError(await response.json().catch(() => null), response);
  return response.json();
}
export async function getSnow(tripId: string) {
  const result = await createBrowserClient().GET(
    "/api/trips/{trip_id}/ski/conditions",
    { params: { path: { trip_id: tripId } } },
  );
  if (!result.response.ok || !result.data)
    throw toApiError(result.error, result.response);
  return result.data;
}
/** Downloads never escape the same-origin document file route. */
export function documentPath(value: string): string | null {
  if (!/^\/api\/documents\/[^/?#]+\/file(?:\?[^#]*)?$/.test(value)) return null;
  return value;
}
