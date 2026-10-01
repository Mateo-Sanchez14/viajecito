import { createBrowserClient } from "@/shared/api/client";
import { toApiError } from "@/shared/api/errors";
import type { components } from "@/shared/api/schema";

type Schemas = components["schemas"];

export type Resort = Schemas["ResortOut"];
export type SnowReport = Schemas["SnowReportOut"];
export type TripResort = Schemas["TripResortOut"];
export type SkiOverview = Schemas["SkiOverviewOut"];
export type SkiConditions = Schemas["SkiConditionsOut"];
export type PersonRef = Schemas["PersonRefOut"];
export type PassRow = Schemas["PassRowOut"];
export type PassIn = Schemas["PassIn"];
export type PassStatus = PassRow["status"];
export type GearRow = Schemas["GearRowOut"];
export type GearItemIn = Schemas["GearItemIn"];
export type GearItem = GearRow["item"];
export type GearMode = GearRow["mode"];
export type LevelGroup = Schemas["LevelGroupOut"];
export type ManualReportIn = Schemas["ManualReportIn"];
export type SkiProfile = Schemas["SkiProfileOut"];
export type SkiProfileIn = Schemas["SkiProfileIn"];

export const GEAR_ITEMS = [
  "skis",
  "board",
  "boots",
  "poles",
  "helmet",
  "goggles",
  "jacket",
  "pants",
  "other",
] as const satisfies readonly GearItem[];

export const PASS_STATUSES = [
  "needed",
  "bought",
  "season_pass",
  "not_needed",
] as const satisfies readonly PassStatus[];

export const skiKeys = {
  overview: (tripId: string) => ["ski", tripId] as const,
  conditions: (tripId: string) => ["ski", tripId, "conditions"] as const,
  resorts: (country?: Resort["country"]) => ["ski", "resorts", country ?? "all"] as const,
  profile: () => ["ski", "profile", "me"] as const,
};

/** Unwraps an openapi-fetch result: the payload on success, an ApiError otherwise. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}

/** For `204` answers: nothing to return, but a failure must still throw. */
function expectOk(result: { error?: unknown; response: Response }): void {
  if (!result.response.ok) throw toApiError(result.error, result.response);
}

const client = () => createBrowserClient();
const tripPath = (tripId: string) => ({ params: { path: { trip_id: tripId } } });
const resortPath = (tripId: string, resortId: string) => ({
  params: { path: { trip_id: tripId, resort_id: resortId } },
});

export async function listResorts(country?: Resort["country"]): Promise<Resort[]> {
  return unwrap(await client().GET("/api/ski/resorts", { params: { query: { country } } }));
}

export async function getSkiOverview(tripId: string): Promise<SkiOverview> {
  return unwrap(await client().GET("/api/trips/{trip_id}/ski", tripPath(tripId)));
}

export async function getSkiConditions(tripId: string): Promise<SkiConditions> {
  return unwrap(await client().GET("/api/trips/{trip_id}/ski/conditions", tripPath(tripId)));
}

export async function addTripResort(tripId: string, resortId: string): Promise<TripResort> {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/ski/resorts", {
      ...tripPath(tripId),
      body: { resort_id: resortId },
    }),
  );
}

export async function removeTripResort(tripId: string, resortId: string): Promise<void> {
  expectOk(
    await client().DELETE("/api/trips/{trip_id}/ski/resorts/{resort_id}", resortPath(tripId, resortId)),
  );
}

export async function createManualReport(
  tripId: string,
  resortId: string,
  body: ManualReportIn,
): Promise<SnowReport> {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/ski/resorts/{resort_id}/reports", {
      ...resortPath(tripId, resortId),
      body,
    }),
  );
}

export async function setMyPass(tripId: string, body: PassIn): Promise<PassRow> {
  return unwrap(
    await client().PUT("/api/trips/{trip_id}/ski/passes/me", { ...tripPath(tripId), body }),
  );
}

export async function setMyGear(tripId: string, items: GearItemIn[]): Promise<GearRow[]> {
  return unwrap(
    await client().PUT("/api/trips/{trip_id}/ski/gear/me", {
      ...tripPath(tripId),
      body: { items },
    }),
  );
}

export async function getSkiProfile(): Promise<SkiProfile> {
  return unwrap(await client().GET("/api/me/ski_profile"));
}

export async function putSkiProfile(body: SkiProfileIn): Promise<SkiProfile> {
  return unwrap(await client().PUT("/api/me/ski_profile", { body }));
}
