"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** `false` while rendering on the server and during hydration, `true` on the client afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
