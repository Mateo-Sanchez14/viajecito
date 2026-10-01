import { describe, expect, it, vi } from "vitest";
import { handleLogout, handleMe, handleSavedFile, purgePrivateCaches } from "./handlers";

function fakeCaches(saved: Record<string, Response> = {}) {
  return {
    delete: vi.fn<(name: string) => Promise<boolean>>(async () => true),
    match: vi.fn(async (request: Request | string, options?: { cacheName?: string }) => {
      const key = typeof request === "string" ? request : request.url;
      return options?.cacheName === "documents-files-v1" ? saved[key] : undefined;
    }),
  };
}

describe("purgePrivateCaches", () => {
  it("deletes the Today, documents-list and saved-files caches", async () => {
    const caches = fakeCaches();

    await purgePrivateCaches(caches);

    expect(caches.delete.mock.calls.map(([name]) => name)).toEqual([
      "today-v1",
      "documents-list-v1",
      "documents-files-v1",
    ]);
  });
});

describe("handleLogout", () => {
  const request = new Request("https://viajecito.example/api/auth/logout", { method: "POST" });

  it("purges the caches once the logout succeeded", async () => {
    const purge = vi.fn(async () => {});
    const response = await handleLogout(request, async () => new Response(null, { status: 204 }), purge);

    expect(response.status).toBe(204);
    expect(purge).toHaveBeenCalledOnce();
  });

  it("keeps the caches when the logout failed", async () => {
    const purge = vi.fn(async () => {});
    const response = await handleLogout(request, async () => new Response("{}", { status: 403 }), purge);

    expect(response.status).toBe(403);
    expect(purge).not.toHaveBeenCalled();
  });

  it("lets a network failure through untouched", async () => {
    const purge = vi.fn(async () => {});

    await expect(handleLogout(request, async () => Promise.reject(new TypeError("offline")), purge)).rejects.toThrow("offline");
    expect(purge).not.toHaveBeenCalled();
  });
});

describe("handleMe", () => {
  const request = new Request("https://viajecito.example/api/me");

  it("purges the caches on a 401", async () => {
    const purge = vi.fn(async () => {});
    const response = await handleMe(request, async () => new Response("{}", { status: 401 }), purge);

    expect(response.status).toBe(401);
    expect(purge).toHaveBeenCalledOnce();
  });

  it("leaves the caches alone on a 200", async () => {
    const purge = vi.fn(async () => {});
    await handleMe(request, async () => new Response("{}", { status: 200 }), purge);

    expect(purge).not.toHaveBeenCalled();
  });
});

describe("handleSavedFile", () => {
  const url = "https://viajecito.example/api/documents/abc/file";
  const request = new Request(url);

  it("serves a file the user saved for offline use", async () => {
    const caches = fakeCaches({ [url]: new Response("pdf-bytes") });
    const fetchFn = vi.fn();

    const response = await handleSavedFile(request, caches, fetchFn);

    expect(await response.text()).toBe("pdf-bytes");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("matches the saved file whatever query string the viewer adds (?inline=true)", async () => {
    const caches = fakeCaches({ [url]: new Response("pdf-bytes") });

    await handleSavedFile(new Request(`${url}?inline=true`), caches, vi.fn());

    expect(caches.match).toHaveBeenCalledWith(expect.anything(), {
      cacheName: "documents-files-v1",
      ignoreSearch: true,
    });
  });

  it("goes to the network, without storing anything, when the file was not saved", async () => {
    const caches = fakeCaches();
    const fetchFn = vi.fn(async () => new Response("fresh"));

    const response = await handleSavedFile(request, caches, fetchFn);

    expect(await response.text()).toBe("fresh");
    expect(fetchFn).toHaveBeenCalledWith(request);
  });
});
