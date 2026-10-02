import { HttpResponse, http } from "msw";
import { afterEach, expect, it } from "vitest";
import { server } from "@/test/server";
import { createBrowserClient } from "./client";
import { resetCsrfToken } from "./csrf";
import type { paths } from "./schema";

type PackingPatch =
  paths["/api/packing_entries/{entry_id}"]["patch"]["requestBody"]["content"]["application/json"];

// These assignments are also compile regressions: every field may be sent independently,
// without supplying stale packed/position values or weakening the generated client types.
const patches: PackingPatch[] = [
  { label: "Warm socks" },
  { quantity: 2 },
  { packed: true },
  { position: 4 },
];

afterEach(() => resetCsrfToken());

it.each(patches)("ships only the fields provided by a partial packing PATCH: %j", async (body) => {
  const received: unknown[] = [];
  server.use(
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "test-token" })),
    http.patch("*/api/packing_entries/:entryId", async ({ request }) => {
      received.push(await request.json());
      return HttpResponse.json({
        id: "entry-1", section: "custom", item_key: null, label: "Warm socks",
        quantity: 2, packed: true, position: 9,
      });
    }),
  );
  const result = await createBrowserClient().PATCH("/api/packing_entries/{entry_id}", {
    params: { path: { entry_id: "entry-1" } },
    body,
  });
  expect(result.response.status).toBe(200);
  expect(received).toEqual([body]);
  expect(Object.keys(received[0] ?? {})).toHaveLength(1);
});
