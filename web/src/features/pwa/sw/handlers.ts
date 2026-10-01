import { CACHE_NAMES, PURGE_CACHE_NAMES } from "./routes";

type FetchFn = (request: Request) => Promise<Response>;
type Purge = () => Promise<void>;

/** Empties every cache that can hold private trip data. */
export async function purgePrivateCaches(caches: Pick<CacheStorage, "delete">): Promise<void> {
  await Promise.all(PURGE_CACHE_NAMES.map((name) => caches.delete(name)));
}

/** Forwards the logout and, only when it succeeded, drops the private caches. */
export async function handleLogout(request: Request, fetchFn: FetchFn, purge: Purge): Promise<Response> {
  const response = await fetchFn(request);
  if (response.ok) await purge();
  return response;
}

/** `/api/me` is never cached; a 401 means the session is gone, so the private caches go too. */
export async function handleMe(request: Request, fetchFn: FetchFn, purge: Purge): Promise<Response> {
  const response = await fetchFn(request);
  if (response.status === 401) await purge();
  return response;
}

/**
 * Document files are served from the opt-in cache when the user saved them; otherwise they go
 * to the network and are never stored by the worker.
 */
export async function handleSavedFile(
  request: Request,
  caches: Pick<CacheStorage, "match">,
  fetchFn: FetchFn,
): Promise<Response> {
  const saved = await caches.match(request, { cacheName: CACHE_NAMES.documentsFiles, ignoreSearch: true });
  return saved ?? fetchFn(request);
}
