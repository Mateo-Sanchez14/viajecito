// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { textContrast } from "@/test/contrast";
import { Photo } from "@/ui/atoms/Photo";
import { bannerPhoto } from "@/ui/photos/photos";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG = "Un título larguísimo de sección que no tiene ningún espacio razonable para cortar la línea";

/** The banner's markup with the photo in place (the component draws it only after hydration). */
function banner({ title = "Logística", kind = "logistics" as const, withPhoto = true, actions = false } = {}) {
  const photo = bannerPhoto(kind);
  return renderToStaticMarkup(
    <main className="app-canvas mx-auto">
      <header className="section-banner" data-photo={withPhoto ? "" : undefined}>
        {withPhoto && photo && (
          <div className="section-banner-media" aria-hidden="true">
            <Photo photo={photo} />
          </div>
        )}
        <div className="section-banner-panel">
          <div className="section-banner-text">
            <p className="section-banner-eyebrow">Mapa</p>
            <h2 className="section-banner-title">{title}</h2>
            <p className="section-banner-subtitle">Los lugares que propongan van a aparecer acá</p>
          </div>
          {actions && (
            <div className="section-banner-actions">
              <button className="min-h-11 rounded border border-border px-4" type="button">Agregar</button>
            </div>
          )}
        </div>
      </header>
      <p>Contenido</p>
    </main>,
  );
}

let browser: Browser;
let page: Page;
let css = "";

async function show(html: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<body>${html}</body>`);
  await page.addStyleTag({ content: css });
}

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);

it.each([320, 390, 768, 1280])("does not overflow horizontally at %ipx, even with an unbroken title", async (width) => {
  await show(banner({ title: LONG, actions: true }), width);

  expect(await pageWidth()).toBeLessThanOrEqual(width);
  expect(await page.locator(".section-banner-title").textContent()).toBe(LONG);
});

it.each([320, 390, 1280])("keeps the photo a slim strip (84 to 140px tall) filling the content width at %ipx", async (width) => {
  await show(banner(), width);

  const geometry = await page.evaluate(() => {
    const media = document.querySelector(".section-banner-media")!.getBoundingClientRect();
    const img = document.querySelector(".section-banner-media img")!.getBoundingClientRect();
    const main = document.querySelector("main")!;
    const inner = main.getBoundingClientRect().width - parseFloat(getComputedStyle(main).paddingLeft) - parseFloat(getComputedStyle(main).paddingRight);
    return { height: media.height, mediaWidth: media.width, inner, imgSame: Math.abs(img.height - media.height) < 1 && Math.abs(img.width - media.width) < 1 };
  });

  expect(geometry.height).toBeGreaterThanOrEqual(84);
  expect(geometry.height).toBeLessThanOrEqual(140);
  expect(Math.abs(geometry.mediaWidth - geometry.inner)).toBeLessThan(2);
  expect(geometry.imgSame).toBe(true);
});

it("reserves the photo box in the stylesheet: the layout is the same before the image is drawn", async () => {
  await show(banner(), 390);
  const withImage = await page.locator(".section-banner").evaluate((element) => element.getBoundingClientRect().height);

  await page.locator(".section-banner-media img").evaluate((img) => img.remove());

  expect(await page.locator(".section-banner").evaluate((element) => element.getBoundingClientRect().height)).toBe(withImage);
});

it("overlaps the photo's bottom edge with an opaque title panel and keeps all text on the panel", async () => {
  await show(banner(), 390);

  const geometry = await page.evaluate(() => {
    const media = document.querySelector(".section-banner-media")!.getBoundingClientRect();
    const panel = document.querySelector(".section-banner-panel")!;
    const box = panel.getBoundingClientRect();
    const texts = [...document.querySelectorAll(".section-banner-text > *")].map((element) => element.getBoundingClientRect());
    return {
      overlap: media.bottom - box.top,
      background: getComputedStyle(panel).backgroundColor,
      textInsidePanel: texts.every((text) => text.top >= box.top - 0.5 && text.bottom <= box.bottom + 0.5),
      textAbovePhotoBottom: texts.some((text) => text.top < media.bottom),
    };
  });

  expect(geometry.overlap).toBeGreaterThan(0);
  expect(geometry.overlap).toBeLessThanOrEqual(16);
  expect(geometry.background).not.toMatch(/rgba|transparent/);
  expect(geometry.textInsidePanel).toBe(true);
  expect(geometry.textAbovePhotoBottom).toBe(false);
});

it.each([320, 1280])("keeps the action a 44px target beside the title at %ipx", async (width) => {
  await show(banner({ actions: true }), width);

  const box = await page.locator(".section-banner-actions button").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
});

it("is only the title panel, with no overlap, when there is no photo", async () => {
  await show(banner({ withPhoto: false }), 390);

  expect(await page.locator(".section-banner-media").count()).toBe(0);
  const margin = await page.locator(".section-banner-panel").evaluate((element) => getComputedStyle(element).marginTop);
  expect(margin).toBe("0px");
});

it.each(["light", "dark"] as const)("keeps the title, eyebrow and subtitle at WCAG AA on the panel in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await show(banner(), 390);

  for (const text of [".section-banner-title", ".section-banner-eyebrow", ".section-banner-subtitle"]) {
    expect(await textContrast(page, text, ".section-banner-panel"), `${scheme} ${text}`).toBeGreaterThanOrEqual(4.5);
  }
  // Whatever the photo is, it is never behind the text: prove it with a white and a black frame.
  for (const frame of ["rgb(255 255 255)", "rgb(0 0 0)"]) {
    await page.locator(".section-banner-media").evaluate((element, color) => {
      (element as HTMLElement).style.background = color;
      element.querySelector("img")!.style.display = "none";
    }, frame);
    for (const text of [".section-banner-title", ".section-banner-subtitle"]) {
      expect(await textContrast(page, text, ".section-banner-panel"), `${scheme} ${text} on ${frame}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
});
