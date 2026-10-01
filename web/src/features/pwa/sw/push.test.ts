import { describe, expect, it } from "vitest";
import { buildNotification, resolveClickTarget, safeInternalPath } from "./push";

describe("safeInternalPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeInternalPath("/crews/1/trips/2/today")).toBe("/crews/1/trips/2/today");
    expect(safeInternalPath("/crews?x=1#a")).toBe("/crews?x=1#a");
  });

  it.each(["//evil.example", "https://evil.example/x", "javascript:alert(1)", "evil", "", undefined, 3, "/\\evil.example"])(
    "falls back to / for %s",
    (value) => {
      expect(safeInternalPath(value)).toBe("/");
    },
  );
});

describe("buildNotification", () => {
  it("builds the title and options from the payload", () => {
    const { title, options } = buildNotification({ title: "Cuenta regresiva", body: "Falta una semana", url: "/crews/1", tag: "t-1" });

    expect(title).toBe("Cuenta regresiva");
    expect(options).toMatchObject({
      body: "Falta una semana",
      tag: "t-1",
      data: { url: "/crews/1" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });
  });

  it("falls back to safe defaults for a missing or malformed payload", () => {
    expect(buildNotification(null).title).toBe("viajecito");
    expect(buildNotification({ title: 7, body: {}, url: "//evil.example" })).toMatchObject({
      title: "viajecito",
      options: { body: "", data: { url: "/" } },
    });
  });

  it("omits the tag when none is sent so notifications are not silently merged", () => {
    expect(buildNotification({ title: "x" }).options).not.toHaveProperty("tag");
  });
});

describe("resolveClickTarget", () => {
  const origin = "https://viajecito.example";

  it("resolves the stored path to an absolute same-origin URL", () => {
    expect(resolveClickTarget({ url: "/crews/1" }, origin)).toBe("https://viajecito.example/crews/1");
  });

  it("never leaves the origin, whatever the data holds", () => {
    expect(resolveClickTarget({ url: "https://evil.example" }, origin)).toBe("https://viajecito.example/");
    expect(resolveClickTarget(undefined, origin)).toBe("https://viajecito.example/");
  });
});
