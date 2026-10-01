/**
 * Route table of the service worker. Pure functions with no service-worker globals so the
 * rules (what is cached, what never is) can be unit-tested; `src/app/sw.ts` wires them to Serwist.
 */

export const CACHE_NAMES = {
  today: "today-v1",
  documentsList: "documents-list-v1",
  documentsFiles: "documents-files-v1",
} as const;

/** Every cache that can hold private trip data: emptied on logout and on a 401 from /api/me. */
export const PURGE_CACHE_NAMES: readonly string[] = [
  CACHE_NAMES.today,
  CACHE_NAMES.documentsList,
  CACHE_NAMES.documentsFiles,
];

export type RouteMatch = {
  url: URL;
  sameOrigin: boolean;
  request: { method: string; mode?: string; destination?: string };
};

const isGet = ({ request }: RouteMatch) => request.method === "GET";

const TODAY_API = /^\/api\/trips\/[^/]+\/today\/?$/;
const TODAY_PAGE = /^\/crews\/[^/]+\/trips\/[^/]+\/today\/?$/;
const DOCUMENTS_LIST = /^\/api\/trips\/[^/]+\/documents\/?$/;
const DOCUMENT_FILE = /^\/api\/documents\/[^/]+\/file\/?$/;
const NETWORK_ONLY = /^\/(api|hooks|admin)(\/|$)/;
const STATIC_DESTINATIONS = new Set(["script", "style", "font", "image", "worker"]);

export const isTodayApi = (m: RouteMatch) => m.sameOrigin && isGet(m) && TODAY_API.test(m.url.pathname);

/** Only real document navigations: RSC/prefetch fetches for the same path stay uncached. */
export const isTodayPage = (m: RouteMatch) =>
  m.sameOrigin &&
  isGet(m) &&
  (m.request.mode === "navigate" || m.request.destination === "document") &&
  TODAY_PAGE.test(m.url.pathname);

/** The list endpoint only; single documents and files are never cached by a rule. */
export const isDocumentsList = (m: RouteMatch) =>
  m.sameOrigin && isGet(m) && DOCUMENTS_LIST.test(m.url.pathname);

export const isDocumentFile = (m: RouteMatch) =>
  m.sameOrigin && isGet(m) && DOCUMENT_FILE.test(m.url.pathname);

export const isLogout = (m: RouteMatch) =>
  m.sameOrigin && m.request.method === "POST" && m.url.pathname === "/api/auth/logout";

export const isMe = (m: RouteMatch) => m.sameOrigin && isGet(m) && m.url.pathname === "/api/me";

/** Every other api/webhook/admin request: never stored. */
export const isNetworkOnly = (m: RouteMatch) => m.sameOrigin && NETWORK_ONLY.test(m.url.pathname);

export const isStaticAsset = (m: RouteMatch) =>
  m.sameOrigin &&
  isGet(m) &&
  !NETWORK_ONLY.test(m.url.pathname) &&
  STATIC_DESTINATIONS.has(m.request.destination ?? "");
