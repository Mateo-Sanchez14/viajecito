import "server-only";
import createClient from "openapi-fetch";
import type { paths } from "./schema";

/** Server client for server components: talks to the api directly and forwards the session. */
export function createServerClient(cookieHeader?: string) {
  return createClient<paths>({
    baseUrl: process.env.API_INTERNAL_URL || "http://localhost:8000",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });
}
