let pending: Promise<ServiceWorkerRegistration | null> | null = null;

/** Test hook: forget the memoised registration. */
export function resetServiceWorkerRegistration(): void {
  pending = null;
}

/**
 * Registers the Serwist worker once per page load. The worker only exists in production builds,
 * so dev and tests (or browsers without support) resolve to `null`; a failure never breaks the app.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (pending) return pending;
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  pending = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  return pending;
}
