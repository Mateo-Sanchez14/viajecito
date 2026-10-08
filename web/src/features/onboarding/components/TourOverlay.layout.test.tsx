// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { cssContrast, textContrast } from "@/test/contrast";
import { placeCard, SPOT_PAD, type Rect } from "../lib/placement";
import { TourOverlay } from "./TourOverlay";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const labels = { skip: "Saltar", back: "Anterior", next: "Siguiente", done: "Listo" };
const ANCHOR: Rect = { x: 24, y: 140, width: 220, height: 56 };

/** The overlay as the server renders it; the browser then opens it and the card is placed as the component does. */
function markup(rect: Rect | null) {
  return renderToStaticMarkup(
    <>
      <main className="app-canvas mx-auto">
        <div
          id="anchor"
          style={{ position: "absolute", left: ANCHOR.x, top: ANCHOR.y, width: ANCHOR.width, height: ANCHOR.height, background: "#ccc" }}
        >
          anchor
        </div>
      </main>
      <TourOverlay
        open
        rect={rect}
        stepKey="nav"
        progress="Paso 2 de 4"
        title="Las secciones del viaje"
        body="Desde acá saltás a propuestas, logística, itinerario y todo lo demás."
        labels={labels}
        isFirst={false}
        isLast={false}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
      />
    </>,
  );
}

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = await compiledCss();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/** Mount, open as a modal, and place the card exactly like TourOverlay's layout effect does. */
async function show(width: number, rect: Rect | null = ANCHOR, scheme: "light" | "dark" = "light") {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
  await page.setContent(`<body class="h-full">${markup(rect)}</body>`);
  await page.addStyleTag({ content: css });
  await page.evaluate(() => document.querySelector("dialog")!.showModal());
  const size = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".tour-card")!;
    return { width: card.offsetWidth, height: card.offsetHeight };
  });
  const place = placeCard(rect, { width, height: 844 }, size);
  await page.evaluate(({ x, y }) => {
    const card = document.querySelector<HTMLElement>(".tour-card")!;
    card.style.setProperty("--card-x", `${x}px`);
    card.style.setProperty("--card-y", `${y}px`);
  }, place);
}

const box = (selector: string) =>
  page.evaluate((sel) => {
    const { x, y, width, height } = document.querySelector(sel)!.getBoundingClientRect();
    return { x, y, width, height };
  }, selector);

describe("TourOverlay layout", () => {
  for (const width of [320, 390, 1280]) {
    it(`keeps the card inside a ${width}px viewport with no horizontal overflow`, async () => {
      await show(width);

      const card = await box(".tour-card");
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(width);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height).toBeLessThanOrEqual(844);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  it("does not cover the highlighted element and puts the ring around it within the documented padding", async () => {
    await show(390);

    const ring = await box(".tour-spotlight");
    const card = await box(".tour-card");
    expect(ring.x).toBeCloseTo(ANCHOR.x - SPOT_PAD, 0);
    expect(ring.y).toBeCloseTo(ANCHOR.y - SPOT_PAD, 0);
    expect(ring.width).toBeCloseTo(ANCHOR.width + SPOT_PAD * 2, 0);
    expect(ring.height).toBeCloseTo(ANCHOR.height + SPOT_PAD * 2, 0);
    const overlapsAnchor = card.y < ANCHOR.y + ANCHOR.height && card.y + card.height > ANCHOR.y;
    expect(overlapsAnchor).toBe(false);
  });

  it("centers the card and paints only the dim when there is no anchor", async () => {
    await show(390, null);

    const card = await box(".tour-card");
    expect(card.x + card.width / 2).toBeCloseTo(195, 0);
    expect(card.y + card.height / 2).toBeCloseTo(422, 0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".tour-spotlight")!).boxShadow)).not.toMatch(
      /rgb\(174, 73, 50\)/,
    );
  });

  it("has controls at least 44px tall and wide", async () => {
    await show(390);

    for (const name of ["Saltar", "Anterior", "Siguiente"]) {
      const button = await page.getByRole("button", { name }).boundingBox();
      expect(button?.height, name).toBeGreaterThanOrEqual(44);
      expect(button?.width, name).toBeGreaterThanOrEqual(44);
    }
  });

  it("shows a focus ring of at least 2px on the keyboard-focused control", async () => {
    await show(390);

    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  for (const scheme of ["light", "dark"] as const) {
    it(`keeps card text at 4.5:1 or better in ${scheme}`, async () => {
      await show(390, ANCHOR, scheme);

      for (const selector of [".tour-title", ".tour-body", ".tour-progress"]) {
        expect(await textContrast(page, selector, ".tour-card"), selector).toBeGreaterThanOrEqual(4.5);
      }
      expect(await textContrast(page, ".tour-actions .ui-button-link", ".tour-card")).toBeGreaterThanOrEqual(4.5);
      expect(await textContrast(page, ".ui-button-primary", ".ui-button-primary")).toBeGreaterThanOrEqual(4.5);
    });

    it(`draws the ring in a color at least 3:1 against the card surface hairline inside it in ${scheme}`, async () => {
      await show(390, ANCHOR, scheme);

      const colors = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return { accent: style.getPropertyValue("--accent").trim(), surface: style.getPropertyValue("--surface").trim() };
      });
      expect(await cssContrast(colors.accent, colors.surface, page)).toBeGreaterThanOrEqual(3);
    });
  }

  it("dims the page with a veil that is darker in the dark scheme", async () => {
    await show(390, ANCHOR, "light");
    const light = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tour-dim").trim());
    await show(390, ANCHOR, "dark");
    const dark = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tour-dim").trim());

    expect(light).toMatch(/rgb\(10 22 18 \/ 0\.55\)/);
    expect(dark).toMatch(/rgb\(4 12 10 \/ 0\.72\)/);
  });

  it("glides the ring and the card on motion tokens, and not at all under reduced motion", async () => {
    await show(390);
    const still = await page.evaluate(() => ({
      ring: getComputedStyle(document.querySelector(".tour-spotlight")!).transitionDuration,
      card: getComputedStyle(document.querySelector(".tour-card")!).transitionDuration,
      halo: getComputedStyle(document.querySelector(".tour-spotlight")!, "::after").animationName,
      fade: getComputedStyle(document.querySelector(".tour")!).animationName,
    }));
    expect(still.ring.split(",").every((value) => parseFloat(value) === 0)).toBe(true);
    expect(still.card.split(",").every((value) => parseFloat(value) === 0)).toBe(true);
    expect(still.halo).toBe("none");
    expect(still.fade).toBe("none");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => document.querySelector(".tour-card")!.setAttribute("data-ready", ""));
    const moving = await page.evaluate(() => ({
      ring: getComputedStyle(document.querySelector(".tour-spotlight")!).transitionProperty,
      ringTime: getComputedStyle(document.querySelector(".tour-spotlight")!).transitionDuration,
      card: getComputedStyle(document.querySelector(".tour-card")!).transitionDuration,
      halo: getComputedStyle(document.querySelector(".tour-spotlight")!, "::after").animationName,
    }));
    expect(moving.ring).toBe("transform, width, height");
    expect(moving.ringTime.split(",").every((value) => parseFloat(value) === 0.42)).toBe(true);
    expect(parseFloat(moving.card)).toBe(0.42);
    expect(moving.halo).toBe("tour-halo");
  });

  it("takes the card's first position instead of travelling to it", async () => {
    await show(390);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const beforeReady = await page.evaluate(() => getComputedStyle(document.querySelector(".tour-card")!).transitionDuration);
    expect(parseFloat(beforeReady)).toBe(0);
  });
});
