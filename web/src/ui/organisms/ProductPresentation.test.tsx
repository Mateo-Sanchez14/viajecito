// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AppHeader } from "./AppHeader";
import { TripShell } from "./TripShell";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const css = (await readFile(
    fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
    "utf8",
  )).replace(/@import[^;]+;/g, "");
  await page.setContent(renderToStaticMarkup(
    <>
      <AppHeader
        appName="viajecito"
        greeting="Hello, Alexandria Cassandra Montgomery"
        logoutLabel="Log out"
        onLogout={() => {}}
      />
      <TripShell
        title="A very long trip title that still needs to wrap"
        subtitle="Our next trip"
        navLabel="Sections"
        navItems={[{ key: "overview", label: "Overview", href: "/trip", active: true }]}
      >
        <p>Trip content</p>
      </TripShell>
    </>,
  ));
  await page.addStyleTag({ content: css });
});

afterAll(async () => {
  await browser?.close();
});

it("frames the product header without losing greeting or logout on small screens", async () => {
  const radius = await page.locator("header").first().evaluate((element) =>
    parseFloat(getComputedStyle(element).borderRadius),
  );
  expect(radius).toBeGreaterThanOrEqual(20);
  expect(await page.getByRole("button", { name: "Log out" }).isVisible()).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

it("allows a long trip heading to wrap without pushing navigation outside the phone", async () => {
  expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain("long trip title");
  const nav = await page.getByRole("navigation", { name: "Sections" }).boundingBox();
  expect(nav?.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

it("keeps the long-name header inside a 320px viewport and constrains it on desktop", async () => {
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await page.locator("header").first().boundingBox())?.width).toBeLessThanOrEqual(1120);
});
