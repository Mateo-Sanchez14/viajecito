// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenApiHttp } from "openapi-msw";
import { server } from "@/test/server";
import { createServerClient } from "./client.server";
import type { paths } from "./schema";

const http = createOpenApiHttp<paths>({ baseUrl: "http://api.internal:8000" });

describe("createServerClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("calls API_INTERNAL_URL and forwards the Cookie header", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://api.internal:8000");
    let receivedCookie: string | null = null;
    server.use(
      http.get("/api/health", ({ request, response }) => {
        receivedCookie = request.headers.get("cookie");
        return response(200).json({
          status: "ok",
          version: "0.1.0",
          checks: { db: "ok", media: "ok" },
        });
      }),
    );

    const { data, response } = await createServerClient(
      "sessionid=abc123",
    ).GET("/api/health");

    expect(response.status).toBe(200);
    expect(data?.status).toBe("ok");
    expect(receivedCookie).toBe("sessionid=abc123");
  });

  it("falls back to localhost:8000 and sends no Cookie header without one", async () => {
    vi.stubEnv("API_INTERNAL_URL", "");
    let receivedCookie: string | null = "unset";
    server.use(
      createOpenApiHttp<paths>({ baseUrl: "http://localhost:8000" }).get(
        "/api/health",
        ({ request, response }) => {
          receivedCookie = request.headers.get("cookie");
          return response(200).json({
            status: "ok",
            version: "0.1.0",
            checks: { db: "ok", media: "ok" },
          });
        },
      ),
    );

    await createServerClient().GET("/api/health");

    expect(receivedCookie).toBeNull();
  });
});
