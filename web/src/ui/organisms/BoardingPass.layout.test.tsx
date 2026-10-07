// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it , vi } from "vitest";
import { textContrast } from "@/test/contrast";
import { StatCard } from "../molecules/StatCard";
import { TripCoverArt } from "../illustrations/TripCoverArt";
import { BoardingPass } from "./BoardingPass";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG_DESTINATION =
  "San Carlos de Bariloche, Provincia de Río Negro, Patagonia Argentina, camino de los Siete Lagos";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const css = (await readFile(resolve(process.cwd(), "src/app/globals.css"), "utf8")).replace(/@import[^;]+;/g, "");
  await page.setContent(
    renderToStaticMarkup(
      <main className="app-canvas mx-auto">
        <BoardingPass
          media={<TripCoverArt scene="road" />}
          countdown={{ value: "Mañana", caption: "arrancamos" }}
          facts={[
            { label: "Fechas", value: "1 jul 2027 al 8 jul 2027" },
            { label: "Destino", value: LONG_DESTINATION },
            { label: "Moneda", value: "USD" },
          ]}
        />
        <ul className="trip-stats">
          {[0, 1, 2, 3].map((index) => (
            <li key={index}>
              <StatCard
                icon={<svg width="20" height="20" />}
                value="12"
                label="propuestas decididas"
                detail="3 abiertas"
                progress={{ value: 0.4, label: "Propuestas decididas" }}
                href="#"
              />
            </li>
          ))}
        </ul>
      </main>,
    ),
  );
  await page.addStyleTag({ content: css });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

afterAll(async () => {
  await browser?.close();
});

it.each([320, 390])("does not overflow horizontally at %ipx with a very long destination", async (width) => {
  await page.setViewportSize({ width, height: 900 });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const destination = page.getByText(LONG_DESTINATION);
  const bounds = await destination.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  // Full text stays in the DOM for assistive tech.
  expect(await destination.textContent()).toBe(LONG_DESTINATION);
});

it("stacks the picture and the pass below 900px and sits them side by side from 900px", async () => {
  const boxes = () =>
    page.evaluate(() => {
      const media = document.querySelector(".trip-hero-media")!.getBoundingClientRect();
      const pass = document.querySelector(".trip-pass")!.getBoundingClientRect();
      return { media: { left: media.left, bottom: media.bottom, right: media.right }, pass: { left: pass.left, top: pass.top } };
    });

  await page.setViewportSize({ width: 899, height: 900 });
  const stacked = await boxes();
  expect(stacked.pass.top).toBeLessThan(stacked.media.bottom); // overlaps the picture
  expect(stacked.pass.left).toBeGreaterThanOrEqual(stacked.media.left);

  await page.setViewportSize({ width: 1280, height: 900 });
  const wide = await boxes();
  expect(wide.pass.left).toBeGreaterThanOrEqual(wide.media.right);
});

it("lays the stat cards out as 2 columns on phones and 4 from 900px", async () => {
  // Columns as the cards lie, not as the track list reads: auto-fit keeps collapsed tracks in the computed value.
  const columns = () =>
    page.evaluate(
      () => new Set([...document.querySelectorAll(".trip-stats > li")].map((item) => Math.round(item.getBoundingClientRect().left))).size,
    );

  await page.setViewportSize({ width: 390, height: 900 });
  expect(await columns()).toBe(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await columns()).toBe(4);
});

it("gives the countdown a tabular figure at display size", async () => {
  await page.setViewportSize({ width: 390, height: 900 });
  const value = await page.locator(".trip-pass-value").evaluate((element) => {
    const style = getComputedStyle(element);
    return { numeric: style.fontVariantNumeric, size: parseFloat(style.fontSize) };
  });

  expect(value.numeric).toContain("tabular-nums");
  expect(value.size).toBeGreaterThanOrEqual(44);
});

it.each(["light", "dark"] as const)(
  "keeps pass text at WCAG AA in %s whatever the picture behind the pass is",
  async (scheme) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

    for (const media of ["rgb(255 255 255)", "rgb(0 0 0)"]) {
      await page.locator(".trip-hero-media").evaluate((element, color) => {
        (element as HTMLElement).style.background = color;
        element.querySelector("svg")!.style.display = "none";
      }, media);
      expect(await textContrast(page, ".trip-pass-value", ".trip-pass"), `${scheme} value on ${media}`).toBeGreaterThanOrEqual(4.5);
      expect(await textContrast(page, ".trip-pass-caption", ".trip-pass"), `${scheme} caption on ${media}`).toBeGreaterThanOrEqual(4.5);
      expect(await textContrast(page, ".trip-pass-fact dt", ".trip-pass"), `${scheme} label on ${media}`).toBeGreaterThanOrEqual(4.5);
      expect(await textContrast(page, ".trip-pass-fact dd", ".trip-pass"), `${scheme} fact on ${media}`).toBeGreaterThanOrEqual(4.5);
    }
    // The pass paints its own opaque surface, so a photo can never sit under its text.
    const alpha = await page.locator(".trip-pass").evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(alpha).not.toMatch(/rgba|transparent/);
  },
);

it("keeps stat card text at WCAG AA in both themes", async () => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    expect(await textContrast(page, ".stat-card-value", ".stat-card"), `${scheme} value`).toBeGreaterThanOrEqual(4.5);
    expect(await textContrast(page, ".stat-card-detail", ".stat-card"), `${scheme} detail`).toBeGreaterThanOrEqual(4.5);
    expect(await textContrast(page, ".stat-card-icon", ".stat-card-icon"), `${scheme} icon`).toBeGreaterThanOrEqual(4.5);
  }
});

it("clips the art cleanly: stacked, the pass is as wide as the picture and the picture has no bottom corners to peek out", async () => {
  await page.setViewportSize({ width: 390, height: 900 });
  // The contrast tests above hide the scene and recolor the frame.
  await page.locator(".trip-hero-media").evaluate((element) => {
    (element as HTMLElement).style.background = "";
    element.querySelector("svg")!.style.display = "";
  });
  const stacked = await page.evaluate(() => {
    const media = document.querySelector(".trip-hero-media")!;
    const mediaBox = media.getBoundingClientRect();
    const passBox = document.querySelector(".trip-pass")!.getBoundingClientRect();
    const style = getComputedStyle(media);
    return {
      strips: { left: passBox.left - mediaBox.left, right: mediaBox.right - passBox.right },
      overlap: mediaBox.bottom - passBox.top,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
      overflow: style.overflow,
    };
  });

  expect(stacked.strips.left).toBeLessThanOrEqual(0.5);
  expect(stacked.strips.right).toBeLessThanOrEqual(0.5);
  expect(stacked.overlap).toBeGreaterThan(0);
  expect(stacked.radii.slice(0, 2).every((radius) => parseFloat(radius) > 0)).toBe(true);
  expect(stacked.radii.slice(2)).toEqual(["0px", "0px"]);
  expect(stacked.overflow).toBe("hidden");

  // The scene runs past the clipped bottom edge, so the wedges the pass corners reveal are never the road band.
  const overrun = await page.evaluate(() => {
    const art = document.querySelector(".trip-hero-media > .trip-cover-art")!.getBoundingClientRect();
    return art.bottom - document.querySelector(".trip-hero-media")!.getBoundingClientRect().bottom;
  });
  expect(overrun).toBeGreaterThanOrEqual(36);

  await page.setViewportSize({ width: 1280, height: 900 });
  const wide = await page.evaluate(() => {
    const media = document.querySelector(".trip-hero-media")!;
    const art = document.querySelector(".trip-hero-media > .trip-cover-art")!.getBoundingClientRect();
    return { radius: getComputedStyle(media).borderBottomLeftRadius, overrun: art.bottom - media.getBoundingClientRect().bottom };
  });
  expect(parseFloat(wide.radius)).toBeGreaterThan(0);
  expect(Math.abs(wide.overrun)).toBeLessThanOrEqual(0.5);
});
