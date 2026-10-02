import { http, HttpResponse } from "msw";
import type { Task, Packing } from "../api/logistics";
export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    trip_id: "22222222-2222-4222-8222-222222222222",
    number: 1,
    kind: "todo",
    title: "Book car",
    notes: "",
    owner: null,
    due_on: null,
    status: "open",
    quantity: null,
    proposal_id: null,
    source: "manual",
    nudge_count: 0,
    done_at: null,
    done_by: null,
    overdue: false,
    created_at: "2027-01-01T00:00:00Z",
    updated_at: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}
export const emptyPacking: Packing = {
  templates_available: [{ key: "generic", label: "Básica" }],
  applied: [],
  sections: [],
  progress: { packed: 0, total: 0 },
};
export function logisticsHandlers(tasks: Task[] = [makeTask()]) {
  return [
    http.get("*/api/trips/:id/tasks", () => HttpResponse.json(tasks)),
    http.get("*/api/trips/:id/packing/me", () =>
      HttpResponse.json(emptyPacking),
    ),
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
  ];
}
