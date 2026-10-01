import { describe, expect, it } from "vitest";
import { ApiError, toApiError } from "./errors";

describe("toApiError", () => {
  it("takes the code from a {code,message} body", () => {
    const error = toApiError({ code: "not_found", message: "x" }, new Response(null, { status: 404 }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "not_found", status: 404 });
  });

  it("falls back to unknown for text or empty bodies", () => {
    expect(toApiError("oops", new Response(null, { status: 502 })).code).toBe("unknown");
    expect(toApiError(undefined, new Response(null, { status: 500 })).code).toBe("unknown");
  });

  it("reads Retry-After as seconds", () => {
    const response = new Response(null, { status: 429, headers: { "Retry-After": "42" } });

    expect(toApiError({ code: "rate_limited" }, response).retryAfterSeconds).toBe(42);
  });
});
