// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { TripShell } from "../organisms/TripShell";
import { BottomNav, type BottomNavItem } from "./BottomNav";

const icon = <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" />;
const item = (key: string, label: string, active = false): BottomNavItem => ({
  key,
  label,
  href: `/t/${key}`,
  active,
  icon,
});

const PRIMARY = [
  item("overview", "Resumen"),
  item("proposals", "Propuestas", true),
  item("logistics", "Logística"),
  item("itinerary", "Itinerario"),
];
const MORE = [item("dates", "Fechas"), item("budget", "Plata"), item("documents", "Documentos")];

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = (await readFile(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8")).replace(
    /@import[^;]+;/g,
    "",
  );
  await page.setContent(
    renderToStaticMarkup(
      <main className="app-canvas mx-auto">
        <TripShell
          title="Bariloche 2027 con un nombre largo que tiene que envolver sin romper nada"
          navLabel="Secciones del viaje"
          navItems={[...PRIMARY, ...MORE]}
          mobileNav={
            <BottomNav
              label="Menú del viaje"
              items={PRIMARY}
              more={{ label: "Más", title: "Más secciones", closeLabel: "Cerrar", icon, items: MORE }}
            />
          }
        >
          <div style={{ height: 1800 }}>contenido largo</div>
          <a id="last-link" href="/fin">
            Último enlace de la página
          </a>
        </TripShell>
      </main>,
    ),
  );
  await page.addStyleTag({ content: css });
  // Computed colors are read right after the stylesheet lands or the scheme flips: skip color transitions.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

afterAll(async () => {
  await browser?.close();
});

const display = (selector: string) =>
  page.locator(selector).first().evaluate((element) => getComputedStyle(element).display);

it.each([320, 390])("does not overflow horizontally at %ipx", async (width) => {
  await page.setViewportSize({ width, height: 844 });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

it.each([320, 390])("keeps every bottom-nav item at least 44px with unclipped labels at %ipx", async (width) => {
  await page.setViewportSize({ width, height: 844 });
  const items = page.locator(".bottom-nav-item");
  expect(await items.count()).toBe(5);

  for (let index = 0; index < 5; index += 1) {
    const bounds = await items.nth(index).boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  const clipped = await page.locator(".bottom-nav-item > span").evaluateAll((labels) =>
    labels.filter((label) => label.scrollWidth > label.clientWidth).map((label) => label.textContent),
  );
  expect(clipped).toEqual([]);
});

it("shows only the bottom nav below md and only the section nav from md", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await display(".bottom-nav")).not.toBe("none");
  expect(await display(".trip-nav-wide")).toBe("none");
  expect(await page.getByRole("link", { name: "Resumen", exact: true }).count()).toBe(1);
  expect(await page.getByRole("navigation", { name: "Menú del viaje" }).isVisible()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await display(".bottom-nav")).toBe("none");
  expect(await display(".trip-nav-wide")).not.toBe("none");
  expect(await page.getByRole("link", { name: "Resumen", exact: true }).count()).toBe(1);
  expect(await page.getByRole("navigation", { name: "Secciones del viaje" }).isVisible()).toBe(true);
});

it("pads the bar bottom by the safe area in authored css", () => {
  const rule = css.match(/\.bottom-nav\s*\{[^}]*\}/)?.[0] ?? "";

  expect(rule).toContain("env(safe-area-inset-bottom");
});

it("reserves bottom space below md for the bar and none of it from md", async () => {
  const paddingBottom = () => page.locator(".app-canvas").evaluate((element) => getComputedStyle(element).paddingBottom);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(parseFloat(await paddingBottom())).toBe(64 + 120);

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(parseFloat(await paddingBottom())).toBe(96);
});

it("keeps the last interactive element above the bar when scrolled to the end", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const { last, nav } = await page.evaluate(() => ({
    last: document.getElementById("last-link")!.getBoundingClientRect().bottom,
    nav: document.querySelector(".bottom-nav")!.getBoundingClientRect().top,
  }));
  expect(last).toBeLessThanOrEqual(nav);
});

it.each(["light", "dark"] as const)("keeps nav labels at WCAG AA over the bar in %s", async (scheme) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: scheme });

  const ratios = await page.evaluate(() => {
    const read = (css: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      return { context, css };
    };
    const pixel = (layers: string[]) => {
      const { context } = read("");
      context.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        context.fillStyle = layer;
        context.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    const bar = document.querySelector(".bottom-nav") as HTMLElement;
    const barBackground = pixel([getComputedStyle(document.body).backgroundColor, getComputedStyle(bar).backgroundColor]);
    return [...bar.querySelectorAll<HTMLElement>(".bottom-nav-item")].map((element) => {
      const text = pixel([getComputedStyle(element).color]);
      const label = element.querySelector("span")!.textContent;
      return { label, ratio: (Math.max(text, barBackground) + 0.05) / (Math.min(text, barBackground) + 0.05) };
    });
  });

  expect(ratios).toHaveLength(5);
  for (const { label, ratio } of ratios) expect(ratio, `${scheme} ${label}`).toBeGreaterThanOrEqual(4.5);
});
