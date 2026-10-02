import { createBrowserClient } from "@/shared/api/client";
import { toApiError } from "@/shared/api/errors";
import type { components, paths } from "@/shared/api/schema";
export type Document =
  paths["/api/trips/{trip_id}/documents"]["get"]["responses"][200]["content"]["application/json"][number];
export type SkiConditions = components["schemas"]["SkiConditionsOut"];
export async function getDocuments(
  tripId: string,
  signal?: AbortSignal,
): Promise<Document[]> {
  const result = await createBrowserClient().GET("/api/trips/{trip_id}/documents", {
    params: { path: { trip_id: tripId } },
    signal,
  });
  if (!result.response.ok || !result.data)
    throw toApiError(result.error, result.response);
  return result.data;
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
