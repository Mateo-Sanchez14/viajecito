import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import { ApiError } from "@/shared/api/errors";
import { errorCodeToMessageKey } from "./errors";
import { requestOtp, verifyOtp } from "./otp";
import { logout } from "./session";

const origin = globalThis.location.origin;
const http = createOpenApiHttp<paths>({ baseUrl: origin });

const person = {
  id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
  phone: "+5491155551234",
  display_name: "Mateo",
  locale: "es-AR",
};

function csrfHandler(token = "tok-1") {
  let calls = 0;
  const handler = http.get("/api/auth/csrf", ({ response }) => {
    calls += 1;
    return response(200).json({ csrf_token: token });
  });
  return { handler, calls: () => calls };
}

describe("auth api", () => {
  afterEach(() => resetCsrfToken());

  it("sends X-CSRFToken on unsafe methods and fetches the token only once", async () => {
    const csrf = csrfHandler("tok-abc");
    const seen: Array<string | null> = [];
    server.use(
      csrf.handler,
      http.post("/api/auth/otp/request", ({ request, response }) => {
        seen.push(request.headers.get("x-csrftoken"));
        return response(202).json({
          status: "sent",
          retry_after_seconds: 60,
          expires_in_seconds: 300,
        });
      }),
    );

    const first = await requestOtp("+54 9 11 5555 1234");
    await requestOtp("+54 9 11 5555 1234");

    expect(first.retry_after_seconds).toBe(60);
    expect(seen).toEqual(["tok-abc", "tok-abc"]);
    expect(csrf.calls()).toBe(1);
  });

  it("verifyOtp posts phone and code and returns the person", async () => {
    let body: unknown;
    server.use(
      csrfHandler().handler,
      http.post("/api/auth/otp/verify", async ({ request, response }) => {
        body = await request.json();
        return response(200).json({ person });
      }),
    );

    const result = await verifyOtp("+5491155551234", "123456");

    expect(body).toEqual({ phone: "+5491155551234", code: "123456" });
    expect(result.person.display_name).toBe("Mateo");
  });

  it("refetches the CSRF token after a successful verify (the api rotates it)", async () => {
    const csrf = csrfHandler();
    server.use(
      csrf.handler,
      http.post("/api/auth/otp/verify", ({ response }) =>
        response(200).json({ person }),
      ),
      http.post("/api/auth/logout", ({ response }) => response(204).empty()),
    );

    await verifyOtp("+5491155551234", "123456");
    await logout();

    expect(csrf.calls()).toBe(2);
  });

  it("throws an ApiError carrying the code of the error body", async () => {
    server.use(
      csrfHandler().handler,
      http.post("/api/auth/otp/verify", ({ response }) =>
        response(400).json({ code: "invalid_code", message: "Wrong code" }),
      ),
    );

    const failure = await verifyOtp("+5491155551234", "000000").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "invalid_code", status: 400 });
  });

  it("maps a 429 to rate_limited", async () => {
    server.use(
      csrfHandler().handler,
      http.post("/api/auth/otp/request", ({ response }) =>
        response(429).json({ code: "rate_limited", message: "Slow down" }),
      ),
    );

    const failure = await requestOtp("+5491155551234").catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ code: "rate_limited", status: 429 });
    expect(errorCodeToMessageKey((failure as ApiError).code)).toBe(
      "auth.errors.rate_limited",
    );
  });

  it("falls back to code unknown when the error body is not an api error", async () => {
    server.use(
      csrfHandler().handler,
      http.untyped.post(`${origin}/api/auth/otp/request`, () =>
        HttpResponse.text("<html>Bad Gateway</html>", { status: 502 }),
      ),
    );

    const failure = await requestOtp("+5491155551234").catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ code: "unknown", status: 502 });
  });

  it("logout treats 401 as already logged out", async () => {
    server.use(
      csrfHandler().handler,
      http.post("/api/auth/logout", ({ response }) =>
        response(401).json({ code: "unauthenticated", message: "No session" }),
      ),
    );

    await expect(logout()).resolves.toBeUndefined();
  });
});

describe("errorCodeToMessageKey", () => {
  it.each([
    "invalid_phone",
    "invalid_code",
    "expired_code",
    "too_many_attempts",
    "rate_limited",
    "delivery_unavailable",
  ])("maps %s", (code) => {
    expect(errorCodeToMessageKey(code)).toBe(`auth.errors.${code}`);
  });

  it("falls back to unknown for unrecognised codes", () => {
    expect(errorCodeToMessageKey("something_new")).toBe("auth.errors.unknown");
  });
});
