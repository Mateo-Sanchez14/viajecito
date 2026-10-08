import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import messages from "../messages/es-AR";
import { TOUR_VERSION } from "../src/features/onboarding/lib/version";

const t = messages.onboarding;

/** Step title -> the `data-tour` anchor it points at. */
const ANCHOR_OF: Record<string, string> = {
  [t.steps.nav.title]: "nav",
  [t.steps.cover.title]: "cover",
  [t.steps.nextActions.title]: "next-actions",
  [t.steps.rsvp.title]: "rsvp",
  [t.steps.capture.title]: "capture",
};

/** A trip of its own, so this spec never depends on what the other specs created. */
async function createTrip(request: APIRequestContext) {
  const me = await (await request.get("/api/me")).json();
  const csrf = (await (await request.get("/api/auth/csrf")).json()) as { csrf_token: string };
  const response = await request.post(`/api/crews/${me.crews[0].id}/trips`, {
    headers: { "X-CSRFToken": csrf.csrf_token },
    data: { name: `Tour e2e ${randomUUID()}` },
  });
  expect(response.status()).toBe(201);
  const trip = (await response.json()) as { id: string; crew_id: string };
  return { overview: `/crews/${trip.crew_id}/trips/${trip.id}`, replay: me.crews[0].id as string };
}

/** Opens the tour from the header. A cold dev server may not have hydrated yet, which swallows a click: retry. */
async function openTour(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: t.replay }).click({ timeout: 2000 });
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
}

const box = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const { x, y, width, height } = document.querySelector(sel)!.getBoundingClientRect();
    return { x, y, width, height };
  }, selector);

/** Walks every step at the current viewport: ring over its anchor and card inside the screen, each time. */
async function walk(page: Page) {
  const viewport = page.viewportSize()!;
  const dialog = page.getByRole("dialog");
  const titles: string[] = [];

  for (let step = 0; step < 6; step += 1) {
    const title = (await dialog.getByRole("heading").textContent()) ?? "";
    titles.push(title);
    const anchorName = ANCHOR_OF[title];
    expect(anchorName, `unknown step "${title}"`).toBeDefined();

    // The ring settles on the anchor once it is scrolled into view.
    await expect
      .poll(async () => {
        const anchor = await page.locator(`[data-tour="${anchorName}"]:visible`).first().boundingBox();
        const ring = await box(page, ".tour-spotlight");
        if (!anchor) return "no anchor";
        const pad = 6;
        const over =
          ring.x <= anchor.x - pad + 1 &&
          ring.y <= anchor.y - pad + 1 &&
          ring.x + ring.width >= anchor.x + anchor.width + pad - 1 &&
          ring.y + ring.height >= anchor.y + anchor.height + pad - 1;
        const inside = ring.x >= -pad - 1 && ring.y >= -pad - 1 && ring.x + ring.width <= viewport.width + pad + 1 && ring.y + ring.height <= viewport.height + pad + 1;
        return over && inside ? "ok" : `ring ${JSON.stringify(ring)} anchor ${JSON.stringify(anchor)}`;
      })
      .toBe("ok");

    const card = await box(page, ".tour-card");
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    const done = dialog.getByRole("button", { name: t.done });
    if (await done.isVisible()) {
      await done.click();
      return titles;
    }
    await dialog.getByRole("button", { name: t.next }).click();
  }
  throw new Error("the tour did not end within six steps");
}

test("does not open by itself for a person who saw it, opens from the header and persists", async ({ page, request }) => {
  const { overview } = await createTrip(request);
  await page.goto(overview);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Auto-start waits ~700 ms after the page settles: give it time to (not) happen.
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await openTour(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: t.next })).toBeFocused();

  const titles = await walk(page);

  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(titles[0]).toBe(t.steps.nav.title);
  expect(titles.at(-1)).toBe(t.steps.capture.title);
  // Focus is back on the replay button that opened it.
  await expect(page.getByRole("button", { name: t.replay })).toBeFocused();

  await expect
    .poll(async () => ((await (await request.get("/api/me")).json()) as { person: { tour_seen_version: number } }).person.tour_seen_version)
    .toBeGreaterThanOrEqual(TOUR_VERSION);

  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("goes back, skips with Escape and leaves nothing open", async ({ page, request }) => {
  const { overview } = await createTrip(request);
  await page.goto(overview);
  await openTour(page);
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByRole("button", { name: t.back })).toHaveCount(0);
  await dialog.getByRole("button", { name: t.next }).click();
  await expect(dialog.getByRole("button", { name: t.back })).toBeVisible();
  await dialog.getByRole("button", { name: t.back }).click();
  await expect(dialog.getByRole("heading")).toHaveText(t.steps.nav.title);

  // The dim around the card does not dismiss it.
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("replays from another section of the trip, on its overview", async ({ page, request }) => {
  const { overview } = await createTrip(request);
  await page.goto(`${overview}/proposals`);

  // A cold dev server may not have hydrated the page yet, which would swallow the first click: retry it.
  await expect(async () => {
    await page.getByRole("button", { name: t.replay }).click();
    await expect(page).toHaveURL(new RegExp(`${overview}$`), { timeout: 4000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("dialog").getByRole("button", { name: t.skip }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A replay is not sticky: reloading the destination never restarts it.
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("points at the bottom navigation, keeps ring and card on screen", async ({ page, request }) => {
    const { overview } = await createTrip(request);
    await page.goto(overview);
    await openTour(page);

    // The ring settles on the bottom navigation (the section navigation is hidden below 768px).
    const bottomNav = page.getByRole("navigation", { name: messages.trips.nav.mobileLabel });
    await expect
      .poll(async () => {
        const ring = await box(page, ".tour-spotlight");
        const nav = await bottomNav.boundingBox();
        return nav ? Math.abs(ring.y - (nav.y - 6)) < 2 : false;
      })
      .toBe(true);

    await walk(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("has no serious accessibility violations with the tour open on the overview", async ({ page, request }) => {
  const { overview } = await createTrip(request);
  await page.goto(overview);
  await openTour(page);

  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("at desktop width the first step points at the section navigation", async ({ page, request }) => {
  const { overview } = await createTrip(request);
  await page.goto(overview);
  await openTour(page);

  const wide = page.getByRole("navigation", { name: messages.trips.nav.label });
  await expect
    .poll(async () => {
      const ring = await box(page, ".tour-spotlight");
      const nav = await wide.boundingBox();
      return nav ? Math.abs(ring.y - (nav.y - 6)) < 2 : false;
    })
    .toBe(true);
});
