import { createBrowserClient } from "@/shared/api/client";
import { toApiError } from "@/shared/api/errors";
import type { components } from "@/shared/api/schema";

type Schemas = components["schemas"];

export type SubscriptionIn = Schemas["SubscriptionIn"];
export type SubscriptionOut = Schemas["SubscriptionOut"];
export type PushCategory = "all" | "reminders" | "digest" | "countdown" | "proposals";
export type PushPreferences = Record<PushCategory, boolean>;

export const PUSH_CATEGORIES: readonly PushCategory[] = ["all", "reminders", "digest", "countdown", "proposals"];

export const pushKeys = {
  vapid: ["push", "vapid"] as const,
  subscriptions: ["push", "subscriptions"] as const,
  preferences: ["push", "preferences"] as const,
  device: ["push", "device"] as const,
};

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}

function assertOk(result: { error?: unknown; response: Response }): void {
  if (!result.response.ok) throw toApiError(result.error, result.response);
}

export async function getVapidPublicKey(): Promise<string> {
  return unwrap(await createBrowserClient().GET("/api/notifications/vapid_public_key")).public_key;
}

export async function listSubscriptions(): Promise<SubscriptionOut[]> {
  return unwrap(await createBrowserClient().GET("/api/notifications/subscriptions"));
}

export async function registerSubscription(body: SubscriptionIn): Promise<SubscriptionOut> {
  return unwrap(await createBrowserClient().POST("/api/notifications/subscriptions", { body }));
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  assertOk(await createBrowserClient().DELETE("/api/notifications/subscriptions", { body: { endpoint } }));
}

/** Missing categories default to enabled, as on the server. */
function withDefaults(push: Record<string, boolean>): PushPreferences {
  return Object.fromEntries(PUSH_CATEGORIES.map((category) => [category, push[category] ?? true])) as PushPreferences;
}

export async function getPreferences(): Promise<PushPreferences> {
  return withDefaults(unwrap(await createBrowserClient().GET("/api/notifications/preferences")).push);
}

export async function putPreferences(preferences: PushPreferences): Promise<PushPreferences> {
  return withDefaults(
    unwrap(await createBrowserClient().PUT("/api/notifications/preferences", { body: { push: preferences } })).push,
  );
}

export async function sendTestPush(): Promise<number> {
  return unwrap(await createBrowserClient().POST("/api/notifications/test")).sent;
}
