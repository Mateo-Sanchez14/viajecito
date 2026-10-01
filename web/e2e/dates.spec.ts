import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import messages from "../messages/es-AR";

const phone = process.env.E2E_PHONE ?? "+54 9 11 5555 1234";
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";
const m = messages.dates;

// Needs the dev stack with fake Gowa (same as login.spec.ts); a retry would hit the OTP rate limit.
test.describe.configure({ retries: 0 });

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

test("open a dates decision, mark days, close it and see the dates on the overview", async ({ page, request }) => {
  await login(page, request);

  // A fresh trip without dates, so the overview card has something to change.
  await page.getByText(messages.trips.create.open).first().click();
  await page.getByLabel(messages.trips.create.name).fill(`Fechas e2e ${Date.now()}`);
  await page.getByRole("button", { name: messages.trips.create.submit }).click();
  await page.waitForURL(/\/crews\/[^/]+\/trips\/[^/]+$/);

  await page.getByRole("link", { name: messages.trips.modules.dates, exact: true }).first().click();
  await expect(page.getByText(m.empty.title)).toBeVisible();

  // A two-week window starting on the 1st of next month, for 7-day trips.
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() + 1, 1);
  const iso = (offset: number) => new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel(m.open.from).fill(iso(0));
  await page.getByLabel(m.open.to).fill(iso(13));
  await page.getByLabel(m.open.minDays).fill("7");
  await page.getByRole("button", { name: m.open.submit }).click();

  // Mark three days with taps (each tap: empty -> yes) and wait for the debounced save to land.
  const grid = page.getByRole("grid", { name: m.grid.label });
  await expect(grid).toBeVisible();
  const saved = page.waitForResponse(
    (response) => response.url().includes("/availability") && response.request().method() === "PUT",
  );
  const cells = grid.locator("[data-date]");
  for (let i = 0; i < 3; i += 1) await cells.nth(i).click();
  await saved;

  // The best window appears; closing it asks for confirmation and writes the trip dates.
  await page.getByRole("button", { name: new RegExp(m.best.close) }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: m.confirm.closeAction }).click();
  await expect(page.getByRole("heading", { name: m.closed.title })).toBeVisible();

  await page.getByRole("link", { name: messages.trips.modules.overview, exact: true }).click();
  await expect(page.getByText(m.overview.fixed)).toBeVisible();
});
