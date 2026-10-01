import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import messages from "../messages/es-AR";

// The service worker only exists in `next build` output: set this when E2E_BASE_URL points at one.
const productionBuild = Boolean(process.env.E2E_PRODUCTION_BUILD);

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

// Public checks run anonymously.
test.describe("web app manifest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is served, valid and linked from the page head", async ({ page, request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      lang: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({
      name: messages.pwa.name,
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "es-AR",
    });
    expect(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok(), icon.src).toBe(true);
      expect(iconResponse.headers()["content-type"]).toContain("image/png");
    }

    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });
});

test.describe("service worker", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!productionBuild, "The service worker is only built for production (set E2E_PRODUCTION_BUILD=1).");

  test("registers at the site scope and precaches the offline page", async ({ page }) => {
    await page.goto("/~offline");
    // Registered by the root-level ServiceWorkerBoot, not by a card.
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");

    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.context().setOffline(true);
    await page.goto("/~offline");
    await expect(page.getByRole("heading", { name: messages.pwa.offline.page.title })).toBeVisible();
    await page.context().setOffline(false);
  });
});

test.describe("accessibility (axe: no serious or critical violations)", () => {
  test.describe("anonymous", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("public routes", async ({ page }) => {
      for (const path of ["/login", "/~offline"]) {
        await page.goto(path);
        await expectNoSeriousViolations(page);
      }
    });
  });

  test("signed-in routes", async ({ page }) => {
    // Signed in through the shared storage state.
    for (const path of ["/", "/me/notifications"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });
});
