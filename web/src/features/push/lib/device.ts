import { deleteSubscription, registerSubscription } from "../api/push";

/** This browser's current push subscription, or `null` (also where push or workers are missing). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function registerBrowserSubscription(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON();
  return registerSubscription({
    endpoint: endpoint ?? subscription.endpoint,
    keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
    user_agent: navigator.userAgent.slice(0, 300),
  });
}

/**
 * Re-sends an existing browser subscription. The api treats it as idempotent (refresh, or
 * re-assignment to the current person), so after another person signs in on this device the
 * server row follows the signed-in user. Best effort: failures are ignored.
 */
export async function resyncSubscription(): Promise<void> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const subscription = await currentSubscription();
    if (subscription) await registerBrowserSubscription(subscription);
  } catch {
    // Not signed in yet, offline, or push unavailable: the next page load retries.
  }
}

/** Removes this device's subscription from the api and the browser. Never throws. */
export async function dropThisDeviceSubscription(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    try {
      await deleteSubscription(subscription.endpoint);
    } finally {
      // The browser side goes regardless: a dead server row is pruned on the first 410.
      await subscription.unsubscribe().catch(() => false);
    }
  } catch {
    // Logging out must never be blocked by push cleanup.
  }
}
