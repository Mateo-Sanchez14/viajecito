import type { components } from "@/shared/api/schema";

type Schemas = components["schemas"];

export const CREW_ID = "11111111-1111-4111-8111-111111111111";
export const TRIP_ID = "22222222-2222-4222-8222-222222222222";
export const PERSON_ID = "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11";

export function makeParticipant(overrides: Partial<Schemas["ParticipantOut"]> = {}): Schemas["ParticipantOut"] {
  return { person_id: PERSON_ID, display_name: "Mateo", rsvp: "in", ...overrides };
}

export function makeTrip(overrides: Partial<Schemas["TripOut"]> = {}): Schemas["TripOut"] {
  return {
    id: TRIP_ID,
    crew_id: CREW_ID,
    name: "Bariloche 2027",
    type: "generic",
    status: "planning",
    start_on: "2027-07-01",
    end_on: "2027-07-08",
    destination_label: "Bariloche",
    timezone: "America/Argentina/Buenos_Aires",
    currency: "USD",
    fx_rates: {},
    has_cover: false,
    cover_version: 0,
    modules: ["proposals", "dates", "logistics", "itinerary", "today", "budget", "documents"],
    participants: [
      makeParticipant(),
      makeParticipant({ person_id: "33333333-3333-4333-8333-333333333333", display_name: "Lucia Gomez", rsvp: "maybe" }),
    ],
    my_rsvp: "in",
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<Schemas["TripSummaryOut"]> = {}): Schemas["TripSummaryOut"] {
  const { id, name, type, status, start_on, end_on, destination_label, has_cover, cover_version } =
    makeTrip();
  return {
    id,
    name,
    type,
    status,
    start_on,
    end_on,
    destination_label,
    has_cover,
    cover_version,
    ...overrides,
  };
}

export function makeMe(overrides: Partial<Schemas["MeOut"]> = {}): Schemas["MeOut"] {
  return {
    person: { id: PERSON_ID, phone: "+5491155551234", display_name: "Mateo", locale: "es-AR", tour_seen_version: 0 },
    crews: [
      { id: CREW_ID, name: "Los Pibes", role: "admin", gastito_group_url: null, default_trip_id: null },
    ],
    ...overrides,
  };
}

/** Same formatting the UI uses for an ISO day (es-AR, UTC so the day never shifts). */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
