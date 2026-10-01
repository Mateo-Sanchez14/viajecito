import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Browser client: same-origin requests. In production the tunnel routes `/api/*` to the api;
 * in dev the Next.js rewrite proxies it. Falls back to "/" where there is no `location`.
 */
export function createBrowserClient() {
  return createClient<paths>({ baseUrl: globalThis.location?.origin ?? "/" });
}

/** Server client for server components: talks to the api directly and forwards the session. */
export function createServerClient(cookieHeader?: string) {
  return createClient<paths>({
    baseUrl: process.env.API_INTERNAL_URL || "http://localhost:8000",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });
}
