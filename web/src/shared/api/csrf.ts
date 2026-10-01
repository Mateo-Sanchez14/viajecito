import type { Middleware } from "openapi-fetch";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;
// Bumped on every reset so a fetch started before it cannot write a stale token back.
let generation = 0;
// Clones of in-flight unsafe requests, kept so a csrf_failed response can be replayed.
const pendingRetries = new Map<string, Request>();

/** Drops the cached token (after the api rotates it, e.g. on login, or on a CSRF rejection). */
export function resetCsrfToken(): void {
  generation += 1;
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
  if (inflight) return inflight;
  const startedAt = generation;
  const request = fetchCsrfToken()
    .then((token) => {
      if (startedAt === generation) cachedToken = token;
      return token;
    })
    .finally(() => {
      if (startedAt === generation) inflight = null;
    });
  inflight = request;
  return request;
}

async function isCsrfFailure(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return body.code === "csrf_failed";
  } catch {
    return false;
  }
}

/** openapi-fetch middleware: unsafe methods carry `X-CSRFToken`. */
export const csrfMiddleware: Middleware = {
  async onRequest({ request, id }) {
    if (SAFE_METHODS.has(request.method)) return request;
    pendingRetries.set(id, request.clone());
    request.headers.set("X-CSRFToken", await getCsrfToken());
    return request;
  },
  async onResponse({ response, id }) {
    const replay = pendingRetries.get(id);
    pendingRetries.delete(id);
    if (!replay || !(await isCsrfFailure(response))) return;

    // The token was rotated elsewhere (e.g. another tab): reload it and replay exactly once.
    resetCsrfToken();
    replay.headers.set("X-CSRFToken", await getCsrfToken());
    return fetch(replay);
  },
  onError({ id }) {
    pendingRetries.delete(id);
  },
};
