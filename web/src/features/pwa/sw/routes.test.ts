import { describe, expect, it } from "vitest";
import {
  CACHE_NAMES,
  PURGE_CACHE_NAMES,
  isDocumentFile,
  isDocumentsList,
  isLogin,
  isLogout,
  isMe,
  isNetworkOnly,
  isStaticAsset,
  isTodayApi,
  isTodayPage,
  type RouteMatch,
} from "./routes";

const ORIGIN = "https://viajecito.example";
const ID = "22222222-2222-4222-8222-222222222222";

function match(
  path: string,
  init: { method?: string; mode?: string; destination?: string; origin?: string } = {},
): RouteMatch {
  return {
    url: new URL(path, init.origin ?? ORIGIN),
    sameOrigin: (init.origin ?? ORIGIN) === ORIGIN,
    request: { method: init.method ?? "GET", mode: init.mode ?? "cors", destination: init.destination ?? "" },
  };
}

describe("today routes", () => {
  it("matches the Today api for any trip, ignoring the query string", () => {
    expect(isTodayApi(match(`/api/trips/${ID}/today`))).toBe(true);
    expect(isTodayApi(match(`/api/trips/${ID}/today?day=2027-07-02`))).toBe(true);
  });

  it("does not match other trip endpoints or non-GET methods", () => {
    expect(isTodayApi(match(`/api/trips/${ID}`))).toBe(false);
    expect(isTodayApi(match(`/api/trips/${ID}/today/extra`))).toBe(false);
    expect(isTodayApi(match(`/api/trips/${ID}/today`, { method: "POST" }))).toBe(false);
    expect(isTodayApi(match(`/api/trips/${ID}/today`, { origin: "https://evil.example" }))).toBe(false);
  });

  it("matches only document navigations to the Today page", () => {
    const path = `/crews/${ID}/trips/${ID}/today`;
    expect(isTodayPage(match(path, { mode: "navigate", destination: "document" }))).toBe(true);
    expect(isTodayPage(match(path))).toBe(false);
    expect(isTodayPage(match(`/crews/${ID}/trips/${ID}/documents`, { mode: "navigate" }))).toBe(false);
  });
});

describe("documents routes", () => {
  it("matches the documents list only", () => {
    expect(isDocumentsList(match(`/api/trips/${ID}/documents`))).toBe(true);
    expect(isDocumentsList(match(`/api/trips/${ID}/documents?kind=ticket`))).toBe(true);
    expect(isDocumentsList(match(`/api/documents/${ID}`))).toBe(false);
    expect(isDocumentsList(match(`/api/trips/${ID}/documents`, { method: "POST" }))).toBe(false);
  });

  it("recognises document file downloads, which are never cached by a rule", () => {
    expect(isDocumentFile(match(`/api/documents/${ID}/file`))).toBe(true);
    expect(isDocumentFile(match(`/api/documents/${ID}/file?inline=true`))).toBe(true);
    expect(isDocumentFile(match(`/api/documents/${ID}`))).toBe(false);
  });
});

describe("session routes", () => {
  it("matches the login (OTP verify) POST only", () => {
    expect(isLogin(match("/api/auth/otp/verify", { method: "POST" }))).toBe(true);
    expect(isLogin(match("/api/auth/otp/verify", { method: "GET" }))).toBe(false);
    expect(isLogin(match("/api/auth/otp/request", { method: "POST" }))).toBe(false);
  });

  it("matches the logout POST and the /api/me GET", () => {
    expect(isLogout(match("/api/auth/logout", { method: "POST" }))).toBe(true);
    expect(isLogout(match("/api/auth/logout", { method: "GET" }))).toBe(false);
    expect(isMe(match("/api/me"))).toBe(true);
    expect(isMe(match("/api/me", { method: "POST" }))).toBe(false);
  });
});

describe("network-only routes", () => {
  it.each(["/api/trips/x/proposals", "/api/auth/csrf", "/hooks/gowa/", "/admin/", "/admin/login"])(
    "keeps %s off the caches",
    (path) => {
      expect(isNetworkOnly(match(path))).toBe(true);
    },
  );

  it("does not claim the app pages", () => {
    expect(isNetworkOnly(match("/crews"))).toBe(false);
  });
});

describe("static assets", () => {
  it("matches same-origin scripts, styles, fonts and images outside the api", () => {
    expect(isStaticAsset(match("/_next/static/a.js", { destination: "script" }))).toBe(true);
    expect(isStaticAsset(match("/icons/icon-192.png", { destination: "image" }))).toBe(true);
    expect(isStaticAsset(match("/api/x.png", { destination: "image" }))).toBe(false);
    expect(isStaticAsset(match("/a.js", { destination: "script", origin: "https://cdn.example" }))).toBe(false);
    expect(isStaticAsset(match("/page", { destination: "document" }))).toBe(false);
  });
});

describe("cache names", () => {
  it("purges every private cache on logout", () => {
    expect(PURGE_CACHE_NAMES).toEqual([
      CACHE_NAMES.today,
      CACHE_NAMES.documentsList,
      CACHE_NAMES.documentsFiles,
    ]);
    expect(PURGE_CACHE_NAMES).toEqual(["today-v1", "documents-list-v1", "documents-files-v1"]);
  });
});
