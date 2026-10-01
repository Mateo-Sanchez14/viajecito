// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const createServerClient = vi.fn((cookieHeader?: string) => {
  void cookieHeader;
  return { GET: get };
});
let currentPath: string | null = null;

vi.mock("@/shared/api/client.server", () => ({
  createServerClient: (cookieHeader?: string) => createServerClient(cookieHeader),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "sessionid=abc; csrftoken=xyz" }),
  headers: async () =>
    new Headers(currentPath ? { "x-next-path": currentPath } : {}),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireMe } from "./requireMe";

const me = {
  person: {
    id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
    phone: "+5491155551234",
    display_name: "Mateo",
    locale: "es-AR",
  },
  crews: [],
};

describe("requireMe", () => {
  beforeEach(() => {
    get.mockReset();
    createServerClient.mockClear();
    currentPath = null;
  });

  it("returns me and forwards the request cookies to the api", async () => {
    get.mockResolvedValue({ data: me, response: { status: 200 } });

    await expect(requireMe()).resolves.toEqual(me);
    expect(createServerClient).toHaveBeenCalledWith(
      "sessionid=abc; csrftoken=xyz",
    );
    expect(get).toHaveBeenCalledWith("/api/me");
  });

  it("redirects to /login with the current path as next on 401", async () => {
    currentPath = "/trips/abc?tab=2";
    get.mockResolvedValue({
      error: { code: "unauthenticated", message: "no" },
      response: { status: 401 },
    });

    await expect(requireMe()).rejects.toThrow(
      `REDIRECT:/login?next=${encodeURIComponent("/trips/abc?tab=2")}`,
    );
  });

  it("redirects to a bare /login when the path is the root or unknown", async () => {
    get.mockResolvedValue({ error: {}, response: { status: 401 } });

    await expect(requireMe()).rejects.toThrow("REDIRECT:/login");

    currentPath = "/";
    await expect(requireMe()).rejects.toThrow(/^REDIRECT:\/login$/);
  });

  it("does not turn other failures into a login redirect", async () => {
    get.mockResolvedValue({ error: "boom", response: { status: 500 } });

    await expect(requireMe()).rejects.toThrow(/HTTP 500/);
  });
});
