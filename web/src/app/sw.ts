/// <reference lib="webworker" />
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from "serwist";
import { handleLogout, handleMe, handleSavedFile, purgePrivateCaches } from "@/features/pwa/sw/handlers";
import { buildNotification, parsePushPayload, resolveClickTarget } from "@/features/pwa/sw/push";
import {
  CACHE_NAMES,
  isDocumentFile,
  isDocumentsList,
  isLogout,
  isMe,
  isNetworkOnly,
  isStaticAsset,
  isTodayApi,
  isTodayPage,
} from "@/features/pwa/sw/routes";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Only complete (200) same-origin responses are ever stored: no opaque, partial or error responses.
const cacheable = () => new CacheableResponsePlugin({ statuses: [200] });

const privateNetworkFirst = (cacheName: string) =>
  new NetworkFirst({
    cacheName,
    networkTimeoutSeconds: 3,
    plugins: [cacheable(), new ExpirationPlugin({ maxEntries: 10 })],
  });

const purge = () => purgePrivateCaches(self.caches);

// First match wins, so order matters: session handling and private data before the generic rules.
const runtimeCaching: RuntimeCaching[] = [
  {
    method: "POST",
    matcher: isLogout,
    handler: { handle: ({ request }) => handleLogout(request, fetch, purge) },
  },
  { matcher: isMe, handler: { handle: ({ request }) => handleMe(request, fetch, purge) } },
  { matcher: isTodayApi, handler: privateNetworkFirst(CACHE_NAMES.today) },
  { matcher: isDocumentsList, handler: privateNetworkFirst(CACHE_NAMES.documentsList) },
  {
    matcher: isDocumentFile,
    handler: { handle: ({ request }) => handleSavedFile(request, self.caches, fetch) },
  },
  { matcher: isTodayPage, handler: privateNetworkFirst(CACHE_NAMES.today) },
  { matcher: isNetworkOnly, handler: new NetworkOnly() },
  { matcher: isStaticAsset, handler: new StaleWhileRevalidate({ cacheName: "static-assets-v1", plugins: [cacheable()] }) },
  // Any other page navigation: network, with the offline page as the fallback below.
  { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(() => event.data?.json());
  const { title, options } = buildNotification(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = resolveClickTarget(event.notification.data, self.location.origin);
  event.waitUntil(focusOrOpen(target));
});

async function focusOrOpen(target: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((client) => client.url === target);
  if (existing) {
    await existing.focus();
    return;
  }
  await self.clients.openWindow(target);
}
