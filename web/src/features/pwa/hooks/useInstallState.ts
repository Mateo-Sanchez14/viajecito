"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallMode = "installed" | "prompt" | "ios" | "none";

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeStandalone(onChange: () => void): () => void {
  const query = window.matchMedia?.(STANDALONE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function isStandalone(): boolean {
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || Boolean(window.matchMedia?.(STANDALONE_QUERY).matches);
}

function isIos(): boolean {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  // iPadOS reports itself as a Mac with a touch screen.
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

const noopSubscribe = () => () => {};

/** Running as an installed app (standalone display mode, or iOS "Add to Home Screen"). */
export function useStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
}

export function useIsIos(): boolean {
  return useSyncExternalStore(noopSubscribe, isIos, () => false);
}

/**
 * Install state: captures `beforeinstallprompt` (Chromium) so the install can be offered from
 * our own UI; on iOS there is no such event, so the caller shows the manual steps instead.
 */
export function useInstallState() {
  const standalone = useStandalone();
  const ios = useIsIos();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event can only be used once; a cancelled prompt keeps the offer for a later try.
    if (outcome === "accepted") setDeferred(null);
  }, [deferred]);

  const mode: InstallMode = standalone || installed ? "installed" : deferred ? "prompt" : ios ? "ios" : "none";
  return { mode, install };
}
