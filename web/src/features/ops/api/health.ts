import { createBrowserClient } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type Health = components["schemas"]["HealthOut"];

export const healthQueryKey = ["ops", "health"] as const;

function isHealth(value: unknown): value is Health {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Health>;
  return (
    (candidate.status === "ok" || candidate.status === "degraded") &&
    typeof candidate.version === "string" &&
    typeof candidate.checks === "object" &&
    candidate.checks !== null
  );
}

/**
 * Only 200 (ok) and 503 (degraded) carry a health payload. Anything else (proxy
 * errors, 404s, malformed bodies) or a network failure is an error.
 */
export async function fetchHealth(): Promise<Health> {
  const { data, error, response } = await createBrowserClient().GET(
    "/api/health",
  );

  if (response.status === 200 && isHealth(data)) return data;
  if (response.status === 503 && isHealth(error)) return error;

  throw new Error(`Unexpected health response (HTTP ${response.status})`);
}
