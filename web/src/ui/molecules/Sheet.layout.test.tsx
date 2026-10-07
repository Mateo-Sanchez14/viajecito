// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Sheet } from "./Sheet";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const css = (await readFile(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8")).replace(
    /@import[^;]+;/g,
    "",
  );
  await page.setContent(
    renderToStaticMarkup(
      <>
        <button type="button">Abrir</button>
        <nav className="bottom-nav" aria-label="Menú">
          <ul>
            <li>
              <a className="bottom-nav-item" href="/x">
                Uno
              </a>
            </li>
          </ul>
        </nav>
        <Sheet open onClose={() => {}} title="Hoja de prueba" closeLabel="Cerrar">
          <a href="/y">Adentro</a>
        </Sheet>
      </>,
    ),
  );
  await page.addStyleTag({ content: css });
  // The component opens itself in an effect, which a static render never runs.
  await page.evaluate(() => (document.querySelector("dialog") as HTMLDialogElement).showModal());
});

afterAll(async () => {
  await browser?.close();
});

const sheet = () => page.locator("dialog.ui-sheet");

it("docks to the bottom edge on phones with 24px top corners and a 44px close button", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  const style = await sheet().evaluate((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      topLeft: parseFloat(computed.borderTopLeftRadius),
      topRight: parseFloat(computed.borderTopRightRadius),
      bottomLeft: parseFloat(computed.borderBottomLeftRadius),
      width: rect.width,
      bottom: rect.bottom,
      height: rect.height,
    };
  });
  expect(style.topLeft).toBe(24);
  expect(style.topRight).toBe(24);
  expect(style.bottomLeft).toBe(0);
  expect(style.width).toBe(390);
  expect(Math.round(style.bottom)).toBe(844);
  expect(style.height).toBeLessThanOrEqual(0.85 * 844);
  expect((await page.getByRole("button", { name: "Cerrar" }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

it("is centered with a capped width from md up", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const rect = await sheet().evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, left: bounds.left, right: bounds.right, radius: parseFloat(getComputedStyle(element).borderBottomLeftRadius) };
  });
  expect(rect.width).toBe(480);
  expect(Math.round(rect.left + rect.right)).toBe(1280);
  expect(rect.radius).toBe(24);
});

it("covers the bottom nav and keeps the page from scrolling behind it", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const topmost = await page.evaluate(() => {
    const nav = document.querySelector(".bottom-nav")!.getBoundingClientRect();
    const hit = document.elementFromPoint(nav.left + nav.width / 2, nav.top + nav.height / 2);
    return hit?.closest("dialog") !== null;
  });
  expect(topmost).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
});

it("uses a tinted, translucent backdrop rather than pure black", async () => {
  const backdrop = await sheet().evaluate((element) => getComputedStyle(element, "::backdrop").backgroundColor);

  expect(backdrop).not.toBe("rgba(0, 0, 0, 0.5)");
  expect(backdrop).toMatch(/^rgba\(10, 22, 18/);
});

it("slides up with a transition when motion is allowed and not under reduced motion", async () => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const motion = await sheet().evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(motion).toContain("transform");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await sheet().evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(reduced.split(",").every((value) => parseFloat(value) === 0)).toBe(true);
});
