import { createOpenApiHttp } from "openapi-msw";
import type { components, paths } from "@/shared/api/schema";
import { PERSON_ID, TRIP_ID, CREW_ID } from "@/features/trips/fixtures";

type Schemas = components["schemas"];

export const PROPOSAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const COMMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const AUTHOR: Schemas["PersonRefOut"] = { person_id: PERSON_ID, display_name: "Mateo" };

export function makeTally(overrides: Partial<Schemas["VoteTallyOut"]> = {}): Schemas["VoteTallyOut"] {
  return { up: 2, neutral: 0, down: 1, score: 1, my_vote: null, majority: false, ...overrides };
}

export function makePreview(overrides: Partial<Schemas["LinkPreviewOut"]> = {}): Schemas["LinkPreviewOut"] {
  return {
    url: "https://www.booking.com/hotel/ar/llao-llao.html",
    final_url: "https://www.booking.com/hotel/ar/llao-llao.html",
    site_name: "Booking.com",
    title: "Llao Llao Resort",
    description: "",
    image_url: "https://cf.bstatic.com/x.jpg",
    has_thumbnail: true,
    price_amount: null,
    price_currency: "",
    lat: null,
    lng: null,
    fetch_status: "ok",
    fetched_at: "2027-01-02T10:00:00Z",
    ...overrides,
  };
}

/** A list item; reuse it from other milestones' tests (the M6 map reads the same endpoint). */
export function makeSummary(overrides: Partial<Schemas["ProposalSummaryOut"]> = {}): Schemas["ProposalSummaryOut"] {
  return {
    id: PROPOSAL_ID,
    trip_id: TRIP_ID,
    category: "lodging",
    status: "proposed",
    title: "Llao Llao Resort",
    note: "",
    author: AUTHOR,
    est_price: null,
    currency: "USD",
    price_basis: "total",
    starts_on: null,
    ends_on: null,
    booking_ref: "",
    preview: makePreview(),
    tally: makeTally(),
    comment_count: 0,
    allowed_transitions: ["discussing", "chosen", "discarded"],
    web_path: `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/${PROPOSAL_ID}`,
    created_at: "2027-01-02T10:00:00Z",
    updated_at: "2027-01-02T10:00:00Z",
    ...overrides,
  };
}

export function makeProposal(overrides: Partial<Schemas["ProposalOut"]> = {}): Schemas["ProposalOut"] {
  return {
    ...makeSummary(),
    votes: [],
    chosen_at: null,
    booked_at: null,
    discarded_at: null,
    source: "whatsapp",
    ...overrides,
  };
}

export function makeComment(overrides: Partial<Schemas["CommentOut"]> = {}): Schemas["CommentOut"] {
  return {
    id: COMMENT_ID,
    proposal_id: PROPOSAL_ID,
    author: AUTHOR,
    body: "Se ve buenisimo",
    source: "web",
    created_at: "2027-01-02T11:00:00Z",
    can_delete: true,
    ...overrides,
  };
}

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location?.origin ?? "http://localhost:3000" });

/**
 * Default happy-path handlers, typed from the generated schema. Tests add or override with
 * `server.use(...)`. Reused by other milestones that read proposals (e.g. the M6 map).
 */
export const proposalsHandlers = [
  http.get("/api/trips/{trip_id}/proposals", ({ response }) => response(200).json([makeSummary()])),
  http.get("/api/trips/{trip_id}/proposals/summary", ({ response }) =>
    response(200).json({ counts: { proposed: 1 }, top: [makeSummary()] }),
  ),
  http.get("/api/proposals/{proposal_id}", ({ response }) => response(200).json(makeProposal())),
  http.get("/api/proposals/{proposal_id}/comments", ({ response }) => response(200).json([])),
];
