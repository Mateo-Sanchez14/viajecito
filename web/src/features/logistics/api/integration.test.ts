import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as browserClient from "@/shared/api/client";
import { server } from "@/test/server";
import { listTasks } from "./logistics";
import { getBudget } from "@/features/budget/api/budget";
import { listDocuments } from "@/features/documents/api/documents";

it("uses the shared browser client for all three integrated capabilities", async () => {
  const client = vi.spyOn(browserClient, "createBrowserClient");
  server.use(
    http.get("*/api/trips/:id/tasks", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/budget", () => HttpResponse.json({})),
    http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
  );
  try {
    await listTasks("t1");
    await getBudget("t1");
    await listDocuments("t1");
    expect(client).toHaveBeenCalledTimes(3);
  } finally {
    client.mockRestore();
  }
});
