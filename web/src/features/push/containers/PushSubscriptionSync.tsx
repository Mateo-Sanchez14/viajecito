"use client";

import { useEffect } from "react";
import { resyncSubscription } from "../lib/device";

/** Mounted in the signed-in shell: keeps this browser's push subscription tied to the current user. */
export function PushSubscriptionSync() {
  useEffect(() => {
    void resyncSubscription();
  }, []);
  return null;
}
