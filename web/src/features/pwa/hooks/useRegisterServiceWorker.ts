"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "../lib/registerServiceWorker";

/** Registers the service worker when the first PWA card mounts (idempotent). */
export function useRegisterServiceWorker(): void {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
}
