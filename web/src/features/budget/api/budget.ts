import { createBrowserClient } from "@/shared/api/client";
import {
  unwrap,
  type JsonRequest,
} from "@/features/logistics/api/responses";
import type { paths } from "@/shared/api/schema";
export type Budget =
  paths["/api/trips/{trip_id}/budget"]["get"]["responses"][200]["content"]["application/json"];
export type FxRates = JsonRequest<
  "/api/trips/{trip_id}/budget/fx_rates",
  "put"
>;
export async function getBudget(tripId: string) {
  return unwrap(
    await createBrowserClient().GET("/api/trips/{trip_id}/budget", {
      params: { path: { trip_id: tripId } },
    }),
  );
}
export async function setFxRates(tripId: string, body: FxRates) {
  return unwrap(
    await createBrowserClient().PUT("/api/trips/{trip_id}/budget/fx_rates", {
      params: { path: { trip_id: tripId } },
      body,
    }),
  );
}
