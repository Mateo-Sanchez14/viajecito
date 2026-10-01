"use client";

import { useCallback, useSyncExternalStore } from "react";
import { dismiss, isDismissed, subscribeDismissals } from "../lib/dismissal";

/** Whether `key` was dismissed within `ttlMs`; hidden (true) on the server to avoid a flash. */
export function useDismissal(key: string, ttlMs: number): [dismissed: boolean, dismissNow: () => void] {
  const dismissed = useSyncExternalStore(
    subscribeDismissals,
    () => isDismissed(key, ttlMs),
    () => true,
  );
  const dismissNow = useCallback(() => dismiss(key), [key]);
  return [dismissed, dismissNow];
}
