"use client";

import { useEffect } from "react";
import { startInstallCapture } from "../lib/installEvent";
import { registerServiceWorker } from "../lib/registerServiceWorker";

/** Mounted once at the root: registers the service worker and holds the install prompt event. */
export function ServiceWorkerBoot() {
  useEffect(() => {
    startInstallCapture();
    void registerServiceWorker();
  }, []);
  return null;
}
