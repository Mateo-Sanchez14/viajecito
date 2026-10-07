// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it , vi } from "vitest";
import { cssContrast, textContrast } from "@/test/contrast";
import { categoryColors } from "../lib/places";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

/** OpenStreetMap's raster land color: the map surface under a pin whatever the app theme is. */
const MAP_TILE = "#f2efe9";

let browser: Browser;
let page: Page;
let moduleCss = "";

beforeAll(async () => {
  moduleCss = await readFile(resolve(process.cwd(), "src/features/map/components/map.module.css"), "utf8");
  const globals = (await readFile(resolve(process.cwd(), "src/app/globals.css"), "utf8")).replace(/@import[^;]+;/g, "");
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(
    `<body><span class="pin"><span class="number" style="--marker-color:#7c3aed">1</span><span class="label">Alojamiento</span></span></body>`,
  );
  await page.addStyleTag({ content: globals });
  await page.addStyleTag({ content: moduleCss.replace(/:global\(([^)]+)\)/g, "$1") });
});

afterAll(async () => {
  await browser?.close();
});

describe("map pin styles", () => {
  it("hold no color literal: every pin color comes from a token", () => {
    const withoutComments = moduleCss.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(withoutComments).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|color-mix)\(/);
    expect(withoutComments).not.toMatch(/:\s*(white|black)\b/);
  });

  it.each(["light", "dark"] as const)("keeps the label at WCAG AA over its chip in %s", async (scheme) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

    expect(await textContrast(page, ".label", ".label")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["light", "dark"] as const)("keeps the pin number readable on every category color in %s", async (scheme) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

    for (const [category, color] of Object.entries(categoryColors)) {
      await page.locator(".number").evaluate((element, fill) => element.style.setProperty("--marker-color", fill), color);
      expect(await textContrast(page, ".number", ".number"), `${scheme} ${category}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("separates the pin ring from the map surface by 3:1 in dark", async () => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    const ring = await page.locator(".number").evaluate((element) => getComputedStyle(element).borderTopColor);

    expect(await cssContrast(ring, MAP_TILE, page)).toBeGreaterThanOrEqual(3);
  });

  it("changes with the theme: the chip is surface and foreground, not fixed light colors", async () => {
    const chip = async (scheme: "light" | "dark") => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      return page.locator(".label").evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.color];
      });
    };

    expect(await chip("light")).not.toEqual(await chip("dark"));
  });
});
