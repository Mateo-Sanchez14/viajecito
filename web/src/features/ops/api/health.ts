import { createBrowserClient } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type Health = components["schemas"]["HealthOut"];

export const healthQueryKey = ["ops", "health"] as const;

/**
 * Both 200 (ok) and 503 (degraded) carry a health payload; anything else, or a
 * network failure, is an error.
 */
export async function fetchHealth(): Promise<Health> {
  const { data, error } = await createBrowserClient().GET("/api/health");
  const payload = data ?? error;

  if (!payload) {
    throw new Error("Health endpoint returned no payload");
  }
  return payload;
}
