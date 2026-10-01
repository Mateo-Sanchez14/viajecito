import createClient from "openapi-fetch";
import { csrfMiddleware } from "./csrf";
import type { paths } from "./schema";

/**
 * Browser client: same-origin requests. In production the tunnel routes `/api/*` to the api;
 * in dev the Next.js rewrite proxies it. Falls back to "/" where there is no `location`.
 * Unsafe methods automatically carry the CSRF header (see `csrf.ts`).
 */
export function createBrowserClient() {
  const client = createClient<paths>({
    baseUrl: globalThis.location?.origin ?? "/",
    credentials: "same-origin",
  });
  client.use(csrfMiddleware);
  return client;
}
