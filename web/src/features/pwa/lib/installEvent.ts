/**
 * Module-level capture of `beforeinstallprompt`: Chromium fires it once, early, so it must be
 * held from the root (ServiceWorkerBoot) for cards that mount later.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Snapshot = { event: BeforeInstallPromptEvent | null; installed: boolean };

let state: Snapshot = { event: null, installed: false };
let started = false;
const listeners = new Set<() => void>();

const emit = (next: Snapshot) => {
  state = next;
  listeners.forEach((listener) => listener());
};
const onBeforeInstall = (event: Event) => {
  event.preventDefault();
  emit({ ...state, event: event as BeforeInstallPromptEvent });
};
const onInstalled = () => emit({ event: null, installed: true });

export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);
}

/** Test hook. */
export function resetInstallCapture(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onInstalled);
  }
  started = false;
  state = { event: null, installed: false };
  listeners.forEach((listener) => listener());
}

export const getInstallEvent = () => state.event;
export const isInstalledEvent = () => state.installed;
export const clearInstallEvent = () => emit({ ...state, event: null });

export function subscribeInstall(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
