import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "@/test/server";
import { resetCsrfToken } from "@/shared/api/csrf";
import {
  createEntry,
  moveEntry,
  saveDay,
  addNote,
  updateNote,
  deleteNote,
  deleteEntry,
  updateEntry,
} from "./itinerary";

it("sends local times, day dates and CSRF on all itinerary and note writes", async () => {
  resetCsrfToken();
  const calls: { method: string; path: string; body: unknown }[] = [];
  server.use(
    http.get("*/api/auth/csrf", () =>
      HttpResponse.json({ csrf_token: "token" }),
    ),
    http.all("*/api/*", async ({ request }) => {
      expect(request.headers.get("X-CSRFToken")).toBe("token");
      calls.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: request.method === "DELETE" ? null : await request.json(),
      });
      return request.method === "DELETE"
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json({ id: "entry" });
    }),
  );
  await createEntry("trip", {
    title: "Meet",
    day_date: "2026-10-01",
    start_time: "09:00",
  });
  await updateEntry("entry", { day_date: null });
  await moveEntry("entry", "up");
  await saveDay("trip", "2026-10-01", { title: "First day" });
  await addNote("trip", { body: "Remember tickets" });
  await updateNote("note", { pinned: true });
  await deleteNote("note");
  await deleteEntry("entry");
  expect(calls).toHaveLength(8);
  expect(calls[0].body).toEqual({
    title: "Meet",
    day_date: "2026-10-01",
    start_time: "09:00",
  });
  expect(calls[1].body).toEqual({ day_date: null });
  expect(calls[2].path).toBe("/api/itinerary_entries/entry/move");
});
it("preserves machine error codes without surfacing developer messages", async () => {
  server.use(
    http.post("*/api/itinerary_entries/entry/move", () =>
      HttpResponse.json(
        { code: "cannot_reorder_timed", message: "Internal message" },
        { status: 409 },
      ),
    ),
  );
  await expect(moveEntry("entry", "down")).rejects.toMatchObject({
    code: "cannot_reorder_timed",
    status: 409,
  });
});
