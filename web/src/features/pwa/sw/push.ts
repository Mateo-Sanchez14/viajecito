/** Push payload and click handling for the service worker (pure, testable). */

const DEFAULT_TITLE = "viajecito";
const ICON = "/icons/icon-192.png";

export type PushPayload = { title?: unknown; body?: unknown; url?: unknown; tag?: unknown };

/** Same-origin paths only: anything else (absolute URLs, `//host`, schemes) becomes `/`. */
export function safeInternalPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  // Resolve like the browser does: tabs/newlines are stripped by URL parsing, so "/\t/evil.example"
  // would otherwise become "//evil.example". Accept only what stays on this origin.
  const base = "https://same-origin.invalid";
  try {
    const resolved = new URL(value, base);
    return resolved.origin === base ? resolved.pathname + resolved.search + resolved.hash : "/";
  } catch {
    return "/";
  }
}

export function buildNotification(payload: PushPayload | null | undefined): {
  title: string;
  options: NotificationOptions;
} {
  const data = payload ?? {};
  const title = typeof data.title === "string" && data.title ? data.title : DEFAULT_TITLE;
  const options: NotificationOptions = {
    body: typeof data.body === "string" ? data.body : "",
    data: { url: safeInternalPath(data.url) },
    icon: ICON,
    badge: ICON,
  };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag;
  return { title, options };
}

/** Parses the push event data defensively: bad JSON must never throw inside the worker. */
export function parsePushPayload(read: () => unknown): PushPayload | null {
  try {
    const value = read();
    return typeof value === "object" && value !== null ? (value as PushPayload) : null;
  } catch {
    return null;
  }
}

/** Absolute URL a notification click opens; always on `origin`. */
export function resolveClickTarget(data: unknown, origin: string): string {
  const url = typeof data === "object" && data !== null ? (data as { url?: unknown }).url : undefined;
  return new URL(safeInternalPath(url), origin).toString();
}
