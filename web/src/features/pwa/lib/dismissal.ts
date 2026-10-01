/** A "dismissed until" flag kept in localStorage, safe when storage is blocked or unavailable. */

export const DAY_MS = 86_400_000;

const listeners = new Set<() => void>();

export function subscribeDismissals(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function isDismissed(key: string, ttlMs: number, now = Date.now()): boolean {
  try {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 && now - stored < ttlMs;
  } catch {
    return false;
  }
}

export function dismiss(key: string, now = Date.now()): void {
  try {
    window.localStorage.setItem(key, String(now));
  } catch {
    // Storage blocked: the dismissal only lasts for this page view.
  }
  listeners.forEach((listener) => listener());
}
