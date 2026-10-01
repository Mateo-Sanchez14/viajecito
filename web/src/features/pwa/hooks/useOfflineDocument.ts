"use client";

import { useCallback, useEffect, useState } from "react";
import { isDocumentFilePath } from "../api/documents";
import { CACHE_NAMES } from "../sw/routes";

// "default" is what synthesized same-origin responses (and test doubles) report.
const SAME_ORIGIN_TYPES = new Set<ResponseType>(["basic", "default"]);

export type OfflineStatus = "checking" | "idle" | "saving" | "saved" | "error" | "unsupported";

/**
 * Opt-in offline copy of one document file. The file goes into `documents-files-v1`, the only
 * cache where the service worker serves files from; it is purged on logout.
 */
export function useOfflineDocument(id: string, downloadPath: string) {
  const supported = typeof caches !== "undefined" && isDocumentFilePath(downloadPath);
  const [status, setStatus] = useState<OfflineStatus>(supported ? "checking" : "unsupported");

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void caches
      .open(CACHE_NAMES.documentsFiles)
      .then((cache) => cache.match(downloadPath))
      .then((hit) => active && setStatus(hit ? "saved" : "idle"))
      .catch(() => active && setStatus("idle"));
    return () => {
      active = false;
    };
  }, [supported, downloadPath, id]);

  const save = useCallback(async () => {
    if (!supported) return;
    setStatus("saving");
    try {
      const response = await fetch(downloadPath, { credentials: "same-origin" });
      // Same-origin, direct answers only: never a redirect (e.g. to a login page) or a foreign response.
      if (!response.ok || response.status !== 200 || response.redirected || !SAME_ORIGIN_TYPES.has(response.type)) {
        throw new Error(`Unsafe or failed response (HTTP ${response.status})`);
      }
      const cache = await caches.open(CACHE_NAMES.documentsFiles);
      await cache.put(downloadPath, response);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [supported, downloadPath]);

  const remove = useCallback(async () => {
    if (!supported) return;
    const cache = await caches.open(CACHE_NAMES.documentsFiles);
    await cache.delete(downloadPath);
    setStatus("idle");
  }, [supported, downloadPath]);

  return { status, save, remove };
}
