import { createBrowserClient } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";
import { unwrap } from "@/features/trips/api/trips";

export type Person = components["schemas"]["PersonOut"];

/** Records the highest tour version this person finished or skipped (the api keeps the maximum). */
export async function markTourSeen(version: number): Promise<Person> {
  return unwrap(await createBrowserClient().POST("/api/me/tour", { body: { version } })).person;
}
