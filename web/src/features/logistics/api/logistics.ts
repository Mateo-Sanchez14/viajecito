import { client, unwrap, expectOk, type JsonRequest } from "./client";
import type { paths } from "./draft-schema";
export type Task =
  paths["/api/trips/{trip_id}/tasks"]["get"]["responses"][200]["content"]["application/json"][number];
export type TaskCreate = JsonRequest<"/api/trips/{trip_id}/tasks", "post">;
export type TaskPatch = JsonRequest<"/api/tasks/{task_id}", "patch">;
export type Packing =
  paths["/api/trips/{trip_id}/packing/me"]["get"]["responses"][200]["content"]["application/json"];
export type PackingEntry = Packing["sections"][number]["entries"][number];
export type PackingPatch = JsonRequest<
  "/api/packing_entries/{entry_id}",
  "patch"
>;
export type TaskFilters = { owner?: string; kind?: string; status?: string[] };
export const logisticsKeys = {
  tasks: (tripId: string, filters: TaskFilters = {}) =>
    ["logistics", tripId, "tasks", filters] as const,
  packing: (tripId: string) => ["logistics", tripId, "packing", "me"] as const,
  summary: (tripId: string) =>
    ["logistics", tripId, "packing", "summary"] as const,
};
export async function listTasks(tripId: string, filters: TaskFilters = {}) {
  return unwrap(
    await client().GET("/api/trips/{trip_id}/tasks", {
      params: { path: { trip_id: tripId }, query: filters },
    }),
  );
}
export async function createTask(tripId: string, body: TaskCreate) {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/tasks", {
      params: { path: { trip_id: tripId } },
      body,
    }),
  );
}
export async function updateTask(id: string, body: TaskPatch) {
  return unwrap(
    await client().PATCH("/api/tasks/{task_id}", {
      params: { path: { task_id: id } },
      body,
    }),
  );
}
export async function deleteTask(id: string) {
  expectOk(
    await client().DELETE("/api/tasks/{task_id}", {
      params: { path: { task_id: id } },
    }),
  );
}
export async function getPacking(tripId: string) {
  return unwrap(
    await client().GET("/api/trips/{trip_id}/packing/me", {
      params: { path: { trip_id: tripId } },
    }),
  );
}
export async function applyTemplate(tripId: string, template_key: string) {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/packing/me/apply", {
      params: { path: { trip_id: tripId } },
      body: { template_key },
    }),
  );
}
export async function addPackingEntry(
  tripId: string,
  body: JsonRequest<"/api/trips/{trip_id}/packing/me/entries", "post">,
) {
  return unwrap(
    await client().POST("/api/trips/{trip_id}/packing/me/entries", {
      params: { path: { trip_id: tripId } },
      body,
    }),
  );
}
export async function updatePackingEntry(id: string, body: PackingPatch) {
  return unwrap(
    await client().PATCH("/api/packing_entries/{entry_id}", {
      params: { path: { entry_id: id } },
      body,
    }),
  );
}
export async function deletePackingEntry(id: string) {
  expectOk(
    await client().DELETE("/api/packing_entries/{entry_id}", {
      params: { path: { entry_id: id } },
    }),
  );
}
export async function packingSummary(tripId: string) {
  return unwrap(
    await client().GET("/api/trips/{trip_id}/packing/summary", {
      params: { path: { trip_id: tripId } },
    }),
  );
}
