import { HttpResponse, http as rawHttp } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import { markTourSeen } from "./tour";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const person = {
  id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
  phone: "+5491155551234",
  display_name: "Mateo",
  locale: "es-AR",
  tour_seen_version: 1,
};

afterEach(() => resetCsrfToken());

describe("markTourSeen", () => {
  it("posts the version with the CSRF header and resolves the person", async () => {
    let seen: { body: unknown; csrf: string | null; credentials: string } | undefined;
    server.use(
      csrf,
      rawHttp.post("*/api/me/tour", async ({ request }) => {
        seen = {
          body: await request.json(),
          csrf: request.headers.get("x-csrftoken"),
          credentials: request.credentials,
        };
        return HttpResponse.json({ person });
      }),
    );

    const result = await markTourSeen(1);

    expect(seen).toEqual({ body: { version: 1 }, csrf: "tok", credentials: "same-origin" });
    expect(result.tour_seen_version).toBe(1);
  });

  it("rejects with the api error code when the api refuses", async () => {
    server.use(
      csrf,
      rawHttp.post("*/api/me/tour", () =>
        HttpResponse.json({ code: "invalid_request", message: "dev text" }, { status: 400 }),
      ),
    );

    await expect(markTourSeen(0)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(markTourSeen(0)).rejects.toBeInstanceOf(ApiError);
  });
});
