import { describe, expect, it } from "vitest";
import messages from "../../messages/es-AR";
import manifest from "./manifest";

describe("web app manifest", () => {
  const m = manifest();

  it("describes an installable standalone app scoped to the whole site", () => {
    expect(m).toMatchObject({
      name: messages.pwa.name,
      short_name: messages.pwa.name,
      description: messages.pwa.description,
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "es-AR",
    });
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("ships 192 and 512 icons plus a maskable 512", () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose?: string) =>
      icons.some((i) => i.sizes === sizes && i.type === "image/png" && i.purpose === purpose);

    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
    expect(icons.every((i) => i.src.startsWith("/icons/"))).toBe(true);
  });
});
