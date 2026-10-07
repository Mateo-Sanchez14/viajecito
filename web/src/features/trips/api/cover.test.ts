import { HttpResponse, http as rawHttp } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import { TRIP_ID, makeTrip } from "../fixtures";
import { coverPath, deleteCover, uploadCover } from "./cover";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const COVER_URL = `*/api/trips/${TRIP_ID}/cover`;
const webp = () => new Blob([new Uint8Array(16)], { type: "image/webp" });

afterEach(() => resetCsrfToken());

describe("coverPath", () => {
  it("carries the cover version so a changed cover is a new URL", () => {
    expect(coverPath({ id: TRIP_ID, cover_version: 3 })).toBe(`/api/trips/${TRIP_ID}/cover?v=3`);
    expect(coverPath({ id: TRIP_ID, cover_version: 4 })).not.toBe(coverPath({ id: TRIP_ID, cover_version: 3 }));
  });
});

describe("uploadCover", () => {
  it("posts the file as multipart with the CSRF header and resolves the updated trip", async () => {
    let seen: { csrf: string | null; credentials: string; body: string; type: string | null } | undefined;
    server.use(
      csrf,
      rawHttp.post(COVER_URL, async ({ request }) => {
        seen = {
          csrf: request.headers.get("x-csrftoken"),
          credentials: request.credentials,
          body: await request.text(), // jsdom and undici disagree on File, so read the raw multipart
          type: request.headers.get("content-type"),
        };
        return HttpResponse.json(makeTrip({ has_cover: true, cover_version: 1 }));
      }),
    );

    const trip = await uploadCover(TRIP_ID, webp());

    expect(trip).toMatchObject({ has_cover: true, cover_version: 1 });
    expect(seen?.csrf).toBe("tok");
    expect(seen?.credentials).toBe("same-origin");
    expect(seen?.type).toMatch(/^multipart\/form-data; boundary=/);
    // jsdom's File is not undici's, so the filename and bytes do not survive this test transport.
    expect(seen?.body).toContain('Content-Disposition: form-data; name="file"');
    expect(seen?.body).toContain("Content-Type: image/webp");
  });

  it.each([
    [413, "file_too_large"],
    [413, "image_too_large"],
    [415, "unsupported_image"],
    [400, "file_required"],
    [404, "not_found"],
  ])("turns the api %i %s into an ApiError with that code", async (status, code) => {
    server.use(csrf, rawHttp.post(COVER_URL, () => HttpResponse.json({ code, message: "dev text" }, { status })));

    await expect(uploadCover(TRIP_ID, webp())).rejects.toMatchObject({ name: "ApiError", code, status });
  });

  it("reports an unreadable error body as unknown", async () => {
    server.use(csrf, rawHttp.post(COVER_URL, () => new HttpResponse("<html>", { status: 502 })));

    await expect(uploadCover(TRIP_ID, webp())).rejects.toMatchObject({ code: "unknown", status: 502 });
  });

  it("reports an offline browser as network_error", async () => {
    server.use(csrf, rawHttp.post(COVER_URL, () => HttpResponse.error()));

    await expect(uploadCover(TRIP_ID, webp())).rejects.toMatchObject({ code: "network_error", status: 0 });
  });

  it("reloads a rotated CSRF token and replays the upload once", async () => {
    const tokens = ["stale", "fresh"];
    const sent: (string | null)[] = [];
    server.use(
      rawHttp.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: tokens.shift() })),
      rawHttp.post(COVER_URL, ({ request }) => {
        sent.push(request.headers.get("x-csrftoken"));
        return request.headers.get("x-csrftoken") === "fresh"
          ? HttpResponse.json(makeTrip({ has_cover: true, cover_version: 1 }))
          : HttpResponse.json({ code: "csrf_failed", message: "x" }, { status: 403 });
      }),
    );

    await expect(uploadCover(TRIP_ID, webp())).resolves.toMatchObject({ has_cover: true });
    expect(sent).toEqual(["stale", "fresh"]);
  });

  it("does not loop when the CSRF failure persists", async () => {
    let posts = 0;
    server.use(
      rawHttp.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
      rawHttp.post(COVER_URL, () => {
        posts += 1;
        return HttpResponse.json({ code: "csrf_failed", message: "x" }, { status: 403 });
      }),
    );

    await expect(uploadCover(TRIP_ID, webp())).rejects.toMatchObject({ code: "csrf_failed" });
    expect(posts).toBe(2);
  });
});

describe("deleteCover", () => {
  it("sends DELETE with the CSRF header and resolves the updated trip", async () => {
    let token: string | null = null;
    server.use(
      csrf,
      http.delete("/api/trips/{trip_id}/cover", ({ request, params, response }) => {
        token = request.headers.get("x-csrftoken");
        expect(params.trip_id).toBe(TRIP_ID);
        return response(200).json(makeTrip({ has_cover: false, cover_version: 2 }));
      }),
    );

    await expect(deleteCover(TRIP_ID)).resolves.toMatchObject({ has_cover: false, cover_version: 2 });
    expect(token).toBe("tok");
  });

  it("turns a failure into an ApiError", async () => {
    server.use(
      csrf,
      http.delete("/api/trips/{trip_id}/cover", ({ response }) =>
        response(404).json({ code: "not_found", message: "x" }),
      ),
    );

    await expect(deleteCover(TRIP_ID)).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
