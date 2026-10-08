"use client";

import { useSyncExternalStore } from "react";

type Connection = EventTarget & { saveData?: boolean };

const connection = (): Connection | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Connection }).connection;

function subscribe(onChange: () => void): () => void {
  const current = connection();
  current?.addEventListener("change", onChange);
  return () => current?.removeEventListener("change", onChange);
}

/** Whether the person asked for less data (Network Information API). Unknown on the server: assume yes. */
export function useSaveData(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connection()?.saveData === true,
    () => true,
  );
}
