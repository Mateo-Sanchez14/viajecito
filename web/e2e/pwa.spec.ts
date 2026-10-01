import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import messages from "../messages/es-AR";

const phone = process.env.E2E_PHONE ?? "+54 9 11 5555 1234";
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";
// The service worker only exists in `next build` output: set this when E2E_BASE_URL points at one.
const productionBuild = Boolean(process.env.E2E_PRODUCTION_BUILD);

async function readCode(request: APIRequestContext, digits: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${fakeGowaUrl}/__sent/latest?phone=${digits}`);
        if (!response.ok()) return undefined;
        const { message } = (await response.json()) as { message?: string };
        code = /\b(\d{6})\b/.exec(message ?? "")?.[1];
        return code;
      },
      { timeout: 15_000 },
    )
    .toBeDefined();
  return code as string;
}

async function login(page: Page, request: APIRequestContext) {
  await request.delete(`${fakeGowaUrl}/__sent`);
  await page.goto("/login");
  await page.getByLabel(messages.auth.phone.label).fill(phone);
  await page.getByRole("button", { name: messages.auth.phone.submit }).click();
  await expect(page.getByLabel(messages.auth.code.label)).toBeVisible();
  await page.getByLabel(messages.auth.code.label).fill(await readCode(request, phone.replace(/\D/g, "")));
  await page.getByRole("button", { name: messages.auth.code.submit }).click();
  await expect(page.getByText(messages.home.greeting.replace("{name}", "").trim())).toBeVisible();
}

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe("web app manifest", () => {
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
  test.skip(!productionBuild, "The service worker is only built for production (set E2E_PRODUCTION_BUILD=1).");

  test("registers at the site scope and precaches the offline page", async ({ page }) => {
    await page.goto("/~offline");
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      return registration.scope;
    });
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
  test("public routes", async ({ page }) => {
    for (const path of ["/login", "/~offline"]) {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    }
  });

  test("signed-in routes", async ({ page, request }) => {
    await login(page, request);
    for (const path of ["/", "/me/notifications"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });
});
