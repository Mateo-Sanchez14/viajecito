"use client";

import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const id = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(id);
}

/** The current minute on the client; `null` while server rendering so SSR never bakes in a date. */
export function useClientNow(): Date | null {
  const minute = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / MINUTE_MS),
    () => null,
  );
  return minute === null ? null : new Date(minute * MINUTE_MS);
}
