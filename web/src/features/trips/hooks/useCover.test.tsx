import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http as rawHttp } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import { tripKeys } from "../api/trips";
import { CREW_ID, TRIP_ID, makeTrip } from "../fixtures";
import { useClearCover, useSetCover } from "./useCover";

const downscale = vi.hoisted(() => vi.fn());
vi.mock("../lib/downscaleImage", () => ({ downscaleImage: downscale }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(tripKeys.detail(TRIP_ID), makeTrip());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  resetCsrfToken();
  downscale.mockReset();
});

describe("useSetCover", () => {
  it("downscales the file, uploads it and stores the returned trip in the cache", async () => {
    const small = new Blob(["small"], { type: "image/webp" });
    downscale.mockResolvedValue(small);
    server.use(
      csrf,
      rawHttp.post(`*/api/trips/${TRIP_ID}/cover`, () =>
        HttpResponse.json(makeTrip({ has_cover: true, cover_version: 1 })),
      ),
    );
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetCover(TRIP_ID, CREW_ID), { wrapper });
    const file = new File(["big"], "big.jpg", { type: "image/jpeg" });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(downscale).toHaveBeenCalledWith(file);
    expect(client.getQueryData(tripKeys.detail(TRIP_ID))).toMatchObject({ has_cover: true, cover_version: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: tripKeys.crew(CREW_ID) });
  });

  it("leaves the cached trip alone when the upload is rejected", async () => {
    downscale.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    server.use(
      csrf,
      rawHttp.post(`*/api/trips/${TRIP_ID}/cover`, () =>
        HttpResponse.json({ code: "unsupported_image", message: "x" }, { status: 415 }),
      ),
    );
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useSetCover(TRIP_ID, CREW_ID), { wrapper });

    result.current.mutate(new File(["x"], "x.heic"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "unsupported_image" });
    expect(client.getQueryData(tripKeys.detail(TRIP_ID))).toMatchObject({ has_cover: false, cover_version: 0 });
  });
});

describe("useClearCover", () => {
  it("stores the trip without a cover", async () => {
    server.use(
      csrf,
      http.delete("/api/trips/{trip_id}/cover", ({ response }) =>
        response(200).json(makeTrip({ has_cover: false, cover_version: 2 })),
      ),
    );
    const { client, wrapper } = setup();
    client.setQueryData(tripKeys.detail(TRIP_ID), makeTrip({ has_cover: true, cover_version: 1 }));
    const { result } = renderHook(() => useClearCover(TRIP_ID, CREW_ID), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(tripKeys.detail(TRIP_ID))).toMatchObject({ has_cover: false, cover_version: 2 });
  });
});
