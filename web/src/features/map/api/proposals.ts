import { createBrowserClient } from "@/shared/api/client";
import { toApiError } from "@/shared/api/errors";
import type { paths } from "@/shared/api/schema";

export type MapProposal =
  paths["/api/trips/{trip_id}/proposals"]["get"]["responses"][200]["content"]["application/json"][number];
/** Read M1's public HTTP contract without coupling to its feature implementation. */
export async function getMapProposals(
  tripId: string,
  signal?: AbortSignal,
): Promise<MapProposal[]> {
  const result = await createBrowserClient().GET(
    "/api/trips/{trip_id}/proposals",
    {
      params: { path: { trip_id: tripId } },
      signal,
    },
  );
  if (!result.response.ok || result.data === undefined)
    throw toApiError(result.error, result.response);
  return result.data;
}
