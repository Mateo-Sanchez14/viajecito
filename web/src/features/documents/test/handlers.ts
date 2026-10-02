import { http, HttpResponse } from "msw";
import type { Document } from "../api/documents";
export function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    trip_id: "22222222-2222-4222-8222-222222222222",
    title: "Tickets",
    kind: "ticket",
    mime: "application/pdf",
    size: 100,
    visibility: "crew",
    owner: { person_id: "p1", display_name: "Mateo" },
    uploader: { person_id: "p1", display_name: "Mateo" },
    valid_until: null,
    proposal_id: null,
    created_at: "2027-01-01T00:00:00Z",
    download_path: "/api/documents/cccccccc-cccc-4ccc-8ccc-cccccccccccc/file",
    can_delete: true,
    ...overrides,
  };
}
export function documentHandlers(documents: Document[] = [makeDocument()]) {
  return [
    http.get("*/api/trips/:tripId/documents", () =>
      HttpResponse.json(documents),
    ),
  ];
}
