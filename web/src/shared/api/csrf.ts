import type { Middleware } from "openapi-fetch";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

/** Drops the cached token (after the api rotates it, e.g. on login, or on a CSRF rejection). */
export function resetCsrfToken(): void {
  cachedToken = null;
  inflight = null;
}

async function fetchCsrfToken(): Promise<string> {
  // Raw fetch on purpose: going through the typed client would recurse into the middleware.
  const response = await fetch(
    new URL("/api/auth/csrf", globalThis.location?.origin ?? "http://localhost"),
    { credentials: "same-origin" },
  );
  if (!response.ok) {
    throw new Error(`Could not load the CSRF token (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { csrf_token?: unknown };
  if (typeof body.csrf_token !== "string") {
    throw new Error("Malformed CSRF response");
  }
  return body.csrf_token;
}

/** Returns the in-memory CSRF token, loading it from the api on first use. */
export function getCsrfToken(): Promise<string> {
  if (cachedToken) return Promise.resolve(cachedToken);
  inflight ??= fetchCsrfToken()
    .then((token) => {
      cachedToken = token;
      return token;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** openapi-fetch middleware: unsafe methods carry `X-CSRFToken`. */
export const csrfMiddleware: Middleware = {
  async onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method)) {
      request.headers.set("X-CSRFToken", await getCsrfToken());
    }
    return request;
  },
  onResponse({ response }) {
    // A rejected token may be stale; reload it on the next unsafe call.
    if (response.status === 403) resetCsrfToken();
  },
};
