import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { PERSON_ID } from "@/features/trips/fixtures";
import type { components, paths } from "@/shared/api/schema";

type Schemas = components["schemas"];

/** Typed MSW handlers for the dates endpoints, plus factories for their payloads. */
export const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

export const DECISION_ID = "44444444-4444-4444-8444-444444444444";
export const OTHER_PERSON_ID = "33333333-3333-4333-8333-333333333333";
export const THIRD_PERSON_ID = "55555555-5555-4555-8555-555555555555";

export const csrfHandler = http.get("/api/auth/csrf", ({ response }) =>
  response(200).json({ csrf_token: "tok" }),
);

export function makePersonRef(overrides: Partial<Schemas["PersonRefOut"]> = {}): Schemas["PersonRefOut"] {
  return { person_id: PERSON_ID, display_name: "Mateo", ...overrides };
}

export function makeDecision(overrides: Partial<Schemas["DecisionOut"]> = {}): Schemas["DecisionOut"] {
  return {
    id: DECISION_ID,
    trip_id: "22222222-2222-4222-8222-222222222222",
    kind: "dates",
    status: "open",
    window_start: "2027-07-05",
    window_end: "2027-07-18",
    min_days: 7,
    max_days: 7,
    maybe_weight: "0.50",
    deadline: null,
    outcome_start: null,
    outcome_end: null,
    opened_by: makePersonRef(),
    closed_by: null,
    closed_at: null,
    respondents: 2,
    eligible: 3,
    ...overrides,
  };
}

export function makeWindow(overrides: Partial<Schemas["WindowOut"]> = {}): Schemas["WindowOut"] {
  return {
    start: "2027-07-12",
    end: "2027-07-18",
    days: 7,
    avg_score: 1.5,
    no_count: 0,
    blocked_people: [],
    full_people: [PERSON_ID, OTHER_PERSON_ID],
    weekend_days: 2,
    missing_people: [THIRD_PERSON_ID],
    ...overrides,
  };
}

/** Window 2027-07-05 .. 2027-07-18 (Mon .. Sun, two full weeks) with three people. */
export function makeAvailability(overrides: Partial<Schemas["AvailabilityOut"]> = {}): Schemas["AvailabilityOut"] {
  const dates = Array.from({ length: 14 }, (_, i) => `2027-07-${String(5 + i).padStart(2, "0")}`);
  return {
    decision: makeDecision(),
    dates,
    people: [
      { person_id: PERSON_ID, display_name: "Mateo", rsvp: "in", answers: { "2027-07-05": "yes" } },
      {
        person_id: OTHER_PERSON_ID,
        display_name: "Lucia Gomez",
        rsvp: "maybe",
        answers: { "2027-07-12": "yes", "2027-07-13": "maybe", "2027-07-14": "no" },
      },
      { person_id: THIRD_PERSON_ID, display_name: "Fede", rsvp: null, answers: {} },
    ],
    me: PERSON_ID,
    best_windows: [makeWindow()],
    has_data: true,
    non_responders: [makePersonRef({ person_id: THIRD_PERSON_ID, display_name: "Fede" })],
    ...overrides,
  };
}

export const listDecisions = (decisions: Schemas["DecisionOut"][]) =>
  http.get("/api/trips/{trip_id}/decisions", ({ response }) => response(200).json(decisions));

export const getAvailability = (availability: Schemas["AvailabilityOut"]) =>
  http.get("/api/decisions/{decision_id}/availability", ({ response }) =>
    response(200).json(availability),
  );

export const errorBody = (code: string) => ({ code, message: "x" });

export { HttpResponse };
