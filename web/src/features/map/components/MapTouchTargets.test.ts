// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";

it("gives the real Leaflet popup close control a 44px touch target", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<div class="canvas" id="map" style="width:342px;margin-left:16px"></div>');
    await page.addStyleTag({
      path: fileURLToPath(new URL(
        "../../../../node_modules/leaflet/dist/leaflet.css", import.meta.url,
      )),
    });
    const css = await readFile(
      fileURLToPath(new URL("./map.module.css", import.meta.url)), "utf8",
    );
    await page.addStyleTag({ content: css.replace(/:global\(([^)]+)\)/g, "$1") });
    await page.addScriptTag({
      path: fileURLToPath(new URL(
        "../../../../node_modules/leaflet/dist/leaflet.js", import.meta.url,
      )),
    });
    await page.evaluate(() => {
      const leaflet = (window as unknown as { L: typeof import("leaflet") }).L;
      const map = leaflet.map("map").setView([0, 0], 8);
      leaflet.marker([0, 0]).addTo(map).bindPopup("A long place title with a proposal detail link and category label").openPopup();
    });
    await page.waitForTimeout(300); // Allow Leaflet auto-pan to finish before measuring.
    const bounds = await page.locator(".leaflet-popup-close-button").boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    const canvas = await page.locator("#map").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(canvas!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width);
  } finally {
    await browser.close();
  }
});
