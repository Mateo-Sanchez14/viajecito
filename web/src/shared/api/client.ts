import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Browser client: same-origin requests. In production the tunnel routes `/api/*` to the api;
 * in dev the Next.js rewrite proxies it. Falls back to "/" where there is no `location`.
 */
export function createBrowserClient() {
  return createClient<paths>({ baseUrl: globalThis.location?.origin ?? "/" });
}
