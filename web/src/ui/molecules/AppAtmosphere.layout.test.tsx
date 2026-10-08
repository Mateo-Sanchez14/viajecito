// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { textContrast } from "@/test/contrast";
import { AppAtmosphere } from "./AppAtmosphere";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const html = renderToStaticMarkup(
  <>
    <AppAtmosphere />
    <header className="app-header border border-border bg-surface">
      <div className="app-header-inner">viajecito</div>
    </header>
    <main className="app-canvas mx-auto flex w-full flex-1 flex-col gap-8">
      <section className="ui-card bg-surface p-5" id="card">
        <h2 className="text-xl font-semibold">Mis viajes</h2>
        <p className="text-muted">Tu próxima salida</p>
      </section>
    </main>
  </>,
);

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = await compiledCss();
  // The root layout makes html full height and body a flex column.
  await page.setContent(`<html class="h-full"><body class="min-h-full flex flex-col">${html}</body></html>`);
  await page.addStyleTag({ content: css });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

it("is a fixed, inert, aria-hidden layer behind the content", async () => {
  const facts = await page.locator(".app-atmosphere").evaluate((element) => {
    const style = getComputedStyle(element);
    const card = document.querySelector("#card")!.getBoundingClientRect();
    const hit = document.elementFromPoint(card.x + card.width / 2, card.y + card.height / 2);
    return {
      position: style.position,
      pointerEvents: style.pointerEvents,
      zIndex: Number(style.zIndex),
      overflow: style.overflow,
      ariaHidden: element.getAttribute("aria-hidden"),
      contentOnTop: hit?.closest("#card") !== null,
    };
  });

  expect(facts).toEqual({ position: "fixed", pointerEvents: "none", zIndex: -1, overflow: "hidden", ariaHidden: "true", contentOnTop: true });
});

it.each([320, 390, 1280])("never causes horizontal overflow at %ipx", async (width) => {
  await page.setViewportSize({ width, height: 800 });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const box = await page.locator(".app-atmosphere").boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width, height: 800 });
});

it("lets the cards paint opaque surfaces over it", async () => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const background = await page.locator("#card").evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(background, scheme).not.toMatch(/rgba|transparent|\//);
    for (const text of ["#card h2", "#card p"]) {
      expect(await textContrast(page, text, "#card"), `${scheme} ${text}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

it("drifts three glows for 60 to 90 seconds each, with transform and opacity only", async () => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });

  const glows = await page.locator(".app-atmosphere-blob").evaluateAll((elements) =>
    elements.map((element) => {
      const animation = element.getAnimations()[0];
      const effect = animation.effect as KeyframeEffect;
      const timing = effect.getComputedTiming();
      const properties = new Set(
        effect
          .getKeyframes()
          .flatMap((frame) => Object.keys(frame))
          .filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)),
      );
      return { name: (animation as CSSAnimation).animationName, seconds: Number(timing.duration) / 1000, iterations: timing.iterations, properties: [...properties].sort() };
    }),
  );

  expect(glows).toHaveLength(3);
  for (const glow of glows) {
    expect(glow.name).toBe("atmosphere-drift");
    expect(glow.seconds).toBeGreaterThanOrEqual(60);
    expect(glow.seconds).toBeLessThanOrEqual(90);
    expect(glow.iterations).toBe(Infinity);
    expect(glow.properties).toEqual(["opacity", "transform"]);
  }
});

it.each(["light", "dark"] as const)("freezes every layer under reduced motion in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

  const state = await page.evaluate(() => ({
    running: document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect).target?.closest(".app-atmosphere")).length,
    names: [...document.querySelectorAll(".app-atmosphere-blob")].map((element) => getComputedStyle(element).animationName),
  }));

  expect(state.running).toBe(0);
  expect(state.names).toEqual(["none", "none", "none"]);
});

it.each(["light", "dark"] as const)("paints the topographic lines and grain from inline SVG data URIs in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme });

  const layers = await page.locator(".app-atmosphere").evaluate((element) => {
    const lines = getComputedStyle(element, "::before");
    const grain = getComputedStyle(element, "::after");
    return {
      lineMask: lines.maskImage || lines.webkitMaskImage,
      lineOpacity: Number(lines.opacity),
      grainImage: grain.backgroundImage,
      grainOpacity: Number(grain.opacity),
    };
  });

  expect(layers.lineMask).toMatch(/^url\("data:image\/svg\+xml,/);
  expect(layers.grainImage).toMatch(/^url\("data:image\/svg\+xml,/);
  expect(layers.grainImage).toContain("feTurbulence");
  // Faint on purpose: it must never compete with the content.
  expect(layers.lineOpacity).toBeGreaterThan(0);
  expect(layers.lineOpacity).toBeLessThanOrEqual(0.1);
  expect(layers.grainOpacity).toBeGreaterThan(0);
  expect(layers.grainOpacity).toBeLessThanOrEqual(0.08);
});

it("uses dark grain on paper in light and light grain in dark", async () => {
  const grain = async (scheme: "light" | "dark") => {
    await page.emulateMedia({ colorScheme: scheme });
    return page.locator(".app-atmosphere").evaluate((element) => decodeURIComponent(getComputedStyle(element, "::after").backgroundImage));
  };

  // The matrix offset of the red channel: 0 = black ink, 1 = white ink.
  expect(await grain("light")).toContain("values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 0'");
  expect(await grain("dark")).toContain("values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'");
});
