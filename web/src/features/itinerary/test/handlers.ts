import { http, HttpResponse } from "msw";
import type { Entry, Itinerary, Note, Today } from "../api/itinerary";
export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "entry",
    trip_id: "trip",
    title: "Meet at the base",
    kind: "meeting",
    day_date: "2026-10-01",
    starts_at: "2026-10-01T12:00:00Z",
    ends_at: null,
    start_time: "09:00",
    end_time: null,
    location_label: "Base",
    lat: -41,
    lng: -71,
    is_meeting_point: true,
    proposal_id: null,
    source: "manual",
    position: 0,
    notes: "",
    ...overrides,
  };
}
export function makeItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    timezone: "America/Argentina/Buenos_Aires",
    start_on: "2026-10-01",
    end_on: "2026-10-02",
    days: [
      {
        date: "2026-10-01",
        title: "First day",
        notes: "Bring water",
        is_virtual: false,
        entries: [makeEntry()],
      },
    ],
    tray: [
      makeEntry({
        id: "tray",
        title: "Try the cafe",
        day_date: null,
        starts_at: null,
        start_time: null,
      }),
    ],
    out_of_range: [],
    ...overrides,
  };
}
export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note",
    body: "Bring tickets",
    pinned: false,
    author: { person_id: "person", display_name: "Mateo" },
    created_at: "2026-10-01T12:00:00Z",
    can_delete: true,
    ...overrides,
  };
}
export function makeToday(overrides: Partial<Today> = {}): Today {
  return {
    mode: "during",
    local_date: "2026-10-01",
    local_time: "08:00",
    timezone: "America/Argentina/Buenos_Aires",
    countdown_days: null,
    day: makeItinerary().days[0],
    now_entry: null,
    next_entry: makeEntry(),
    next_meeting_point: makeEntry(),
    pinned_notes: [],
    recent_notes: [],
    generated_at: "2026-10-01T11:00:00Z",
    ...overrides,
  };
}
export const itineraryHandler = (value = makeItinerary()) =>
  http.get("*/api/trips/:tripId/itinerary", () => HttpResponse.json(value));
export const notesHandler = (value: Note[] = []) =>
  http.get("*/api/trips/:tripId/notes", () => HttpResponse.json(value));
export const csrfHandler = http.get("*/api/auth/csrf", () =>
  HttpResponse.json({ csrf_token: "tok" }),
);
