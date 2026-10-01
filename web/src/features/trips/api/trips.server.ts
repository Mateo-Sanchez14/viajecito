import "server-only";
import { createServerClient } from "@/shared/api/client.server";
import type { Trip } from "./trips";

/**
 * Server-side trip fetch for the trip layout. A 404 (missing, or not a member: the api never
 * reveals which) returns null; every other failure throws so it is never mistaken for "not found".
 */
export async function getTripServer(
  cookieHeader: string,
  tripId: string,
): Promise<Trip | null> {
  const { data, response } = await createServerClient(cookieHeader).GET(
    "/api/trips/{trip_id}",
    { params: { path: { trip_id: tripId } } },
  );

  if (response.status === 404) return null;
  if (!data) throw new Error(`Could not load the trip (HTTP ${response.status})`);
  return data;
}
