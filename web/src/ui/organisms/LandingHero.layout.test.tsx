// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { textContrast } from "@/test/contrast";
import { Photo } from "@/ui/atoms/Photo";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { scenePhotos } from "@/ui/photos/photos";
import { LandingHero } from "./LandingHero";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG_NAME = "Vacaciones larguísimas de invierno en la Patagonia argentina 2027";

function markup(name = "Bariloche 2027") {
  return renderToStaticMarkup(
    <main className="app-canvas mx-auto">
      <LandingHero
        media={<TripCoverArt scene="road" live />}
        greeting="Hola, Mateo"
        tagline="Planeá el próximo viaje con tu gente"
        next={{
          status: "trip",
          label: "Próximo viaje",
          name,
          destination: "Bariloche",
          dates: "1 jul al 8 jul",
          href: "/crews/c/trips/t",
          cta: "Ver el viaje",
          countdown: { value: "10", unit: "días", caption: "para salir" },
        }}
      />
    </main>,
  );
}

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<body>${markup()}</body>`);
  await page.addStyleTag({ content: css });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth);

it.each([320, 390, 1280])("does not overflow horizontally at %ipx", async (width) => {
  await page.setViewportSize({ width, height: 900 });

  expect(await overflow()).toBeLessThanOrEqual(width);
});

it("caps the content width at 1120px on a 1600px screen", async () => {
  await page.setViewportSize({ width: 1600, height: 900 });

  const width = await page.locator(".landing-hero").evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(1120);
});

it.each([320, 1280])("keeps the call to action a 44px target at %ipx", async (width) => {
  await page.setViewportSize({ width, height: 900 });

  const box = await page.locator(".landing-next .ui-button").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
});

it("stacks media and panel below 900px and sits them side by side from 900px", async () => {
  const boxes = () =>
    page.evaluate(() => {
      const media = document.querySelector(".landing-hero-media")!.getBoundingClientRect();
      const panel = document.querySelector(".landing-hero-panel")!.getBoundingClientRect();
      return { media: { right: media.right, bottom: media.bottom }, panel: { left: panel.left, top: panel.top } };
    });

  await page.setViewportSize({ width: 899, height: 900 });
  const stacked = await boxes();
  expect(stacked.panel.top).toBeLessThan(stacked.media.bottom);

  await page.setViewportSize({ width: 1280, height: 900 });
  const wide = await boxes();
  expect(wide.panel.left).toBeGreaterThanOrEqual(wide.media.right);
});

it("wraps a 60-character trip name at 320px without overflow and keeps the full text", async () => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.setContent(`<body>${markup(LONG_NAME)}</body>`);
  await page.addStyleTag({ content: css });

  expect(await overflow()).toBeLessThanOrEqual(320);
  const name = page.locator(".landing-next-name");
  expect(await name.textContent()).toBe(LONG_NAME);
  const box = await name.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);

  await page.setContent(`<body>${markup()}</body>`);
  await page.addStyleTag({ content: css });
});

it("gives the countdown a tabular figure", async () => {
  const numeric = await page.locator(".landing-next-value").evaluate((element) => getComputedStyle(element).fontVariantNumeric);

  expect(numeric).toContain("tabular-nums");
});

it.each(["light", "dark"] as const)(
  "keeps panel text at WCAG AA in %s over a white or a black media frame",
  async (scheme) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

    for (const frame of ["rgb(255 255 255)", "rgb(0 0 0)"]) {
      await page.locator(".landing-hero-media").evaluate((element, color) => {
        (element as HTMLElement).style.background = color;
        element.querySelector("svg")!.style.display = "none";
      }, frame);
      for (const text of [
        ".landing-hero-greeting",
        ".landing-hero-tagline",
        ".landing-next-label",
        ".landing-next-name",
        ".landing-next-meta",
        ".landing-next-value",
        ".landing-next-caption",
      ]) {
        expect(await textContrast(page, text, ".landing-hero-panel"), `${scheme} ${text} on ${frame}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The panel paints its own opaque surface: media can never sit under the text.
    const background = await page.locator(".landing-hero-panel").evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toMatch(/rgba|transparent/);

    await page.locator(".landing-hero-media").evaluate((element) => {
      (element as HTMLElement).style.background = "";
      element.querySelector("svg")!.style.display = "";
    });
  },
);

it.each([390, 900, 1280])("keeps the hero frame its own size when the photo is a tall portrait, at %ipx", async (width) => {
  const portrait = scenePhotos("city")[0];
  const base = await (async () => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<body>${markup()}</body>`);
    await page.addStyleTag({ content: css });
    return page.locator(".landing-hero").evaluate((element) => element.getBoundingClientRect().height);
  })();

  const html = renderToStaticMarkup(
    <main className="app-canvas mx-auto">
      <LandingHero
        media={<Photo photo={portrait} priority className="trip-hero-photo" />}
        greeting="Hola, Mateo"
        tagline="Planeá el próximo viaje con tu gente"
        next={{ status: "trip", label: "Próximo viaje", name: "Bariloche 2027", destination: "Bariloche", dates: "1 jul al 8 jul", href: "/crews/c/trips/t", cta: "Ver el viaje", countdown: { value: "10", unit: "días", caption: "para salir" } }}
      />
    </main>,
  );
  await page.setContent(`<body>${html}</body>`);
  await page.addStyleTag({ content: css });

  const geometry = await page.evaluate(() => {
    const frame = document.querySelector(".landing-hero-media")!.getBoundingClientRect();
    const img = document.querySelector(".landing-hero-media img")!.getBoundingClientRect();
    return { frame: frame.height, same: Math.abs(frame.height - img.height) < 1 && Math.abs(frame.width - img.width) < 1, hero: document.querySelector(".landing-hero")!.getBoundingClientRect().height };
  });
  expect(geometry.same).toBe(true);
  expect(Math.abs(geometry.hero - base)).toBeLessThan(2);
  expect(await overflow()).toBeLessThanOrEqual(width);
});
