"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useIsIos, useStandalone } from "@/features/pwa/hooks/useInstallState";
import { registerServiceWorker } from "@/features/pwa/lib/registerServiceWorker";
import { deleteSubscription, getVapidPublicKey, pushKeys } from "../api/push";
import { currentSubscription, registerBrowserSubscription } from "../lib/device";
import { urlBase64ToUint8Array } from "../lib/applicationServerKey";
import { notifyPermissionChanged, readPermission, subscribePermission } from "../lib/permission";

export type PushSupport = "unknown" | "unsupported" | "ios-needs-install" | "supported";

const READY_TIMEOUT_MS = 10_000;
const noopSubscribe = () => () => {};

function browserCanPush(): boolean {
  return (
    typeof Notification !== "undefined" &&
    typeof PushManager !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator
  );
}

/** Waits for the service worker to be active; rejects rather than hanging where there is none (dev). */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  await registerServiceWorker();
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("service worker not ready")), READY_TIMEOUT_MS)),
  ]);
}

async function subscribeThisBrowser(): Promise<"granted" | "denied"> {
  const permission = await Notification.requestPermission();
  notifyPermissionChanged();
  if (permission !== "granted") return "denied";

  const [registration, publicKey] = await Promise.all([activeRegistration(), getVapidPublicKey()]);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  try {
    await registerBrowserSubscription(subscription);
  } catch (error) {
    // Keep both sides consistent: no browser subscription without a server record.
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return "granted";
}

async function unsubscribeThisBrowser(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await deleteSubscription(subscription.endpoint);
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}

/** Push state for this browser plus the enable/disable flows. */
export function usePushDevice() {
  const queryClient = useQueryClient();
  const ios = useIsIos();
  const standalone = useStandalone();
  const capable = useSyncExternalStore(noopSubscribe, browserCanPush, () => null);
  const permission = useSyncExternalStore(subscribePermission, readPermission, () => "default" as const);

  const support: PushSupport =
    capable === null ? "unknown" : ios && !standalone ? "ios-needs-install" : capable ? "supported" : "unsupported";

  const subscribed = useQuery({
    queryKey: pushKeys.device,
    queryFn: async () => (await currentSubscription()) !== null,
    enabled: support === "supported",
  });

  const enable = useMutation({
    mutationFn: subscribeThisBrowser,
    onSuccess: (outcome) => {
      if (outcome === "granted") {
        queryClient.setQueryData(pushKeys.device, true);
        void queryClient.invalidateQueries({ queryKey: pushKeys.subscriptions });
      }
    },
  });

  const disable = useMutation({
    mutationFn: unsubscribeThisBrowser,
    onSuccess: () => {
      queryClient.setQueryData(pushKeys.device, false);
      void queryClient.invalidateQueries({ queryKey: pushKeys.subscriptions });
    },
  });

  return {
    support,
    permission,
    subscribed: subscribed.data ?? false,
    loading: support === "supported" && subscribed.isPending,
    enable,
    disable,
  };
}
