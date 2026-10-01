const listeners = new Set<() => void>();

export function subscribePermission(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Tells every subscriber that `Notification.permission` may have changed. */
export function notifyPermissionChanged(): void {
  listeners.forEach((listener) => listener());
}

export type PushPermission = NotificationPermission | "unsupported";

export function readPermission(): PushPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
