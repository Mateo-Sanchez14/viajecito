import createClient from "openapi-fetch";
import { csrfMiddleware } from "@/shared/api/csrf";
import { toApiError } from "@/shared/api/errors";
import type { paths } from "./draft.schema";

export type Itinerary =
  paths["/api/trips/{trip_id}/itinerary"]["get"]["responses"][200]["content"]["application/json"];
export type Day = Itinerary["days"][number];
export type Entry = Itinerary["tray"][number];
export type EntryCreate =
  paths["/api/trips/{trip_id}/itinerary/entries"]["post"]["requestBody"]["content"]["application/json"];
export type EntryPatch =
  paths["/api/itinerary_entries/{entry_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type DayInput =
  paths["/api/trips/{trip_id}/itinerary/days/{date}"]["put"]["requestBody"]["content"]["application/json"];
export type Note =
  paths["/api/trips/{trip_id}/notes"]["get"]["responses"][200]["content"]["application/json"][number];
export type NoteCreate =
  paths["/api/trips/{trip_id}/notes"]["post"]["requestBody"]["content"]["application/json"];
export type NotePatch =
  paths["/api/notes/{note_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type Today =
  paths["/api/trips/{trip_id}/today"]["get"]["responses"][200]["content"]["application/json"];

/** Parallel draft client; swap to the shared generated client after API integration. */
export function client() {
  const value = createClient<paths>({
    baseUrl: globalThis.location?.origin ?? "/",
    credentials: "same-origin",
  });
  value.use(csrfMiddleware);
  return value;
}
function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}
function expectOk(result: { error?: unknown; response: Response }) {
  if (!result.response.ok) throw toApiError(result.error, result.response);
}
const tripPath = (tripId: string) => ({
  params: { path: { trip_id: tripId } },
});
export const itineraryKeys = {
  detail: (id: string) => ["itinerary", id] as const,
  notes: (id: string) => ["itinerary", id, "notes"] as const,
  today: (id: string) => ["today", id] as const,
};
export async function getItinerary(id: string) {
  return unwrap(
    await client().GET("/api/trips/{trip_id}/itinerary", tripPath(id)),
  );
}
export async function createEntry(id: string, body: EntryCreate) {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/itinerary/entries", {
      ...tripPath(id),
      body,
    }),
  );
}
export async function updateEntry(id: string, body: EntryPatch) {
  return unwrap(
    await client().PATCH("/api/itinerary_entries/{entry_id}", {
      params: { path: { entry_id: id } },
      body,
    }),
  );
}
export async function moveEntry(id: string, direction: "up" | "down") {
  return unwrap(
    await client().POST("/api/itinerary_entries/{entry_id}/move", {
      params: { path: { entry_id: id } },
      body: { direction },
    }),
  );
}
export async function deleteEntry(id: string) {
  expectOk(
    await client().DELETE("/api/itinerary_entries/{entry_id}", {
      params: { path: { entry_id: id } },
    }),
  );
}
export async function saveDay(id: string, date: string, body: DayInput) {
  return unwrap(
    await client().PUT("/api/trips/{trip_id}/itinerary/days/{date}", {
      params: { path: { trip_id: id, date } },
      body,
    }),
  );
}
export async function getNotes(id: string) {
  return unwrap(await client().GET("/api/trips/{trip_id}/notes", tripPath(id)));
}
export async function addNote(id: string, body: NoteCreate) {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/notes", {
      ...tripPath(id),
      body,
    }),
  );
}
export async function updateNote(id: string, body: NotePatch) {
  return unwrap(
    await client().PATCH("/api/notes/{note_id}", {
      params: { path: { note_id: id } },
      body,
    }),
  );
}
export async function deleteNote(id: string) {
  expectOk(
    await client().DELETE("/api/notes/{note_id}", {
      params: { path: { note_id: id } },
    }),
  );
}

export async function getToday(
  id: string,
  previous?: { data: Today; etag: string | null },
  signal?: AbortSignal,
) {
  const result = await client().GET("/api/trips/{trip_id}/today", {
    ...tripPath(id),
    headers: previous?.etag ? { "If-None-Match": previous.etag } : undefined,
    signal,
  });
  if (result.response.status === 304 && previous) return previous;
  return { data: unwrap(result), etag: result.response.headers.get("ETag") };
}
