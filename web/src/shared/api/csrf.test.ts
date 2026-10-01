import { HttpResponse, delay } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserClient } from "./client";
import { getCsrfToken, resetCsrfToken } from "./csrf";
import type { paths } from "./schema";
import { server } from "@/test/server";

const origin = globalThis.location.origin;
const http = createOpenApiHttp<paths>({ baseUrl: origin });

describe("csrf middleware", () => {
  afterEach(() => resetCsrfToken());

  it("retries once with a fresh token on 403 csrf_failed", async () => {
    const tokens = ["stale", "fresh"];
    const seen: Array<string | null> = [];
    server.use(
      http.get("/api/auth/csrf", ({ response }) =>
        response(200).json({ csrf_token: tokens.shift() ?? "none" }),
      ),
      http.untyped.post(`${origin}/api/auth/otp/request`, async ({ request }) => {
        seen.push(request.headers.get("x-csrftoken"));
        const body = await request.json();
        expect(body).toEqual({ phone: "+5491155551234" });
        if (seen.length === 1) {
          return HttpResponse.json(
            { code: "csrf_failed", message: "x" },
            { status: 403 },
          );
        }
        return HttpResponse.json(
          { status: "sent", retry_after_seconds: 60, expires_in_seconds: 300 },
          { status: 202 },
        );
      }),
    );

    const { response } = await createBrowserClient().POST(
      "/api/auth/otp/request",
      { body: { phone: "+5491155551234" } },
    );

    expect(response.status).toBe(202);
    expect(seen).toEqual(["stale", "fresh"]);
  });

  it("does not retry a second time when the retry is rejected too", async () => {
    let posts = 0;
    server.use(
      http.get("/api/auth/csrf", ({ response }) =>
        response(200).json({ csrf_token: "t" }),
      ),
      http.untyped.post(`${origin}/api/auth/otp/request`, () => {
        posts += 1;
        return HttpResponse.json(
          { code: "csrf_failed", message: "x" },
          { status: 403 },
        );
      }),
    );

    const { response } = await createBrowserClient().POST(
      "/api/auth/otp/request",
      { body: { phone: "+5491155551234" } },
    );

    expect(response.status).toBe(403);
    expect(posts).toBe(2);
  });

  it("does not retry other 403s", async () => {
    let posts = 0;
    server.use(
      http.get("/api/auth/csrf", ({ response }) =>
        response(200).json({ csrf_token: "t" }),
      ),
      http.untyped.post(`${origin}/api/auth/otp/request`, () => {
        posts += 1;
        return HttpResponse.json(
          { code: "forbidden", message: "x" },
          { status: 403 },
        );
      }),
    );

    await createBrowserClient().POST("/api/auth/otp/request", {
      body: { phone: "+5491155551234" },
    });

    expect(posts).toBe(1);
  });

  it("ignores a token fetch that was in flight when the cache was reset", async () => {
    let calls = 0;
    server.use(
      http.untyped.get(`${origin}/api/auth/csrf`, async () => {
        calls += 1;
        if (calls === 1) {
          await delay(30);
          return HttpResponse.json({ csrf_token: "pre-rotation" });
        }
        return HttpResponse.json({ csrf_token: "post-rotation" });
      }),
    );

    const stale = getCsrfToken();
    resetCsrfToken();
    expect(await getCsrfToken()).toBe("post-rotation");
    await stale;

    expect(await getCsrfToken()).toBe("post-rotation");
    expect(calls).toBe(2);
  });
});
