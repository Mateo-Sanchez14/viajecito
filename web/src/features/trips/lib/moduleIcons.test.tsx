import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { moduleIcon } from "./moduleIcons";

const html = (key: string, active?: boolean) => renderToStaticMarkup(moduleIcon(key, active));

describe("moduleIcon", () => {
  it.each(["overview", "proposals", "dates", "logistics", "itinerary", "today", "budget", "documents", "ski"])(
    "renders a decorative 22px svg for %s",
    (key) => {
      const markup = html(key);

      expect(markup).toMatch(/^<svg/);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain('width="22"');
    },
  );

  it("gives every known section its own glyph", () => {
    const keys = ["overview", "proposals", "dates", "logistics", "itinerary", "today", "budget", "documents", "ski"];

    expect(new Set(keys.map((key) => html(key))).size).toBe(keys.length);
  });

  it("switches to the fill weight when active", () => {
    expect(html("budget", true)).not.toBe(html("budget", false));
    expect(html("budget")).toBe(html("budget", false));
  });

  it("falls back to a neutral icon for plugin modules without one", () => {
    const fallback = html("mystery");

    expect(fallback).toMatch(/^<svg/);
    expect(fallback).not.toBe(html("overview"));
  });
});
