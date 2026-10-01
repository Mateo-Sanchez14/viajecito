import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR";

const m = messages.dates;

// Starts signed in (storage state from auth.setup.ts); a retry would re-create the trip it made.
test.describe.configure({ retries: 0 });

test("open a dates decision, mark days, close it and see the dates on the overview", async ({ page }) => {
  await page.goto("/");

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
