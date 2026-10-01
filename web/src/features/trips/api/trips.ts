import { toApiError } from "@/features/auth/api/errors";
import { createBrowserClient } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

type Schemas = components["schemas"];

export type Trip = Schemas["TripOut"];
export type TripSummary = Schemas["TripSummaryOut"];
export type Participant = Schemas["ParticipantOut"];
export type TripCreate = Schemas["TripCreateIn"];
export type TripPatch = Schemas["TripPatchIn"];
export type Rsvp = Schemas["ParticipationIn"]["rsvp"];
export type TripStatus = Trip["status"];

export const tripKeys = {
  detail: (tripId: string) => ["trips", tripId] as const,
  crew: (crewId: string) => ["trips", "crew", crewId] as const,
};

/** Unwraps an openapi-fetch result: the payload on success, an ApiError otherwise. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}

export async function listTrips(crewId: string): Promise<TripSummary[]> {
  return unwrap(
    await createBrowserClient().GET("/api/crews/{crew_id}/trips", {
      params: { path: { crew_id: crewId } },
    }),
  );
}

export async function createTrip(crewId: string, body: TripCreate): Promise<Trip> {
  return unwrap(
    await createBrowserClient().POST("/api/crews/{crew_id}/trips", {
      params: { path: { crew_id: crewId } },
      body,
    }),
  );
}

export async function getTrip(tripId: string): Promise<Trip> {
  return unwrap(
    await createBrowserClient().GET("/api/trips/{trip_id}", {
      params: { path: { trip_id: tripId } },
    }),
  );
}

export async function patchTrip(tripId: string, body: TripPatch): Promise<Trip> {
  return unwrap(
    await createBrowserClient().PATCH("/api/trips/{trip_id}", {
      params: { path: { trip_id: tripId } },
      body,
    }),
  );
}

export async function setRsvp(tripId: string, rsvp: Rsvp): Promise<Participant> {
  return unwrap(
    await createBrowserClient().PUT("/api/trips/{trip_id}/participation", {
      params: { path: { trip_id: tripId } },
      body: { rsvp },
    }),
  );
}
