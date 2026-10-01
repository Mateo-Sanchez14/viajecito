import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR";

// Needs a production build (the service worker is disabled in dev), a signed-in session and the
// Today page, which lands with M4. Point E2E_TODAY_PATH at it, e.g. /crews/<id>/trips/<id>/today,
// and E2E_STORAGE_STATE at a Playwright storage state of a signed-in member.
const todayPath = process.env.E2E_TODAY_PATH;
const productionBuild = Boolean(process.env.E2E_PRODUCTION_BUILD);

test.skip(!productionBuild || !todayPath, "Needs E2E_PRODUCTION_BUILD=1 and E2E_TODAY_PATH (Today ships with M4).");
if (process.env.E2E_STORAGE_STATE) test.use({ storageState: process.env.E2E_STORAGE_STATE });

test("Today and the documents list open offline; document files do not unless saved", async ({ page, context }) => {
  const tripId = /\/trips\/([^/]+)\/today/.exec(todayPath ?? "")?.[1] ?? "";

  // Online: open Today, let the worker take control, then reload so the page and api are cached.
  await page.goto(todayPath ?? "/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.evaluate((id) => fetch(`/api/trips/${id}/documents`).then((r) => r.status), tripId);

  await context.setOffline(true);
  await page.reload();

  // The cached Today renders instead of the offline fallback page.
  await expect(page).toHaveURL(new RegExp(`${todayPath}$`));
  await expect(page.getByRole("heading", { name: messages.pwa.offline.page.title })).toHaveCount(0);

  // The documents list comes from its cache...
  const listStatus = await page.evaluate((id) => fetch(`/api/trips/${id}/documents`).then((r) => r.status), tripId);
  expect(listStatus).toBe(200);

  // ...but a file that was not explicitly saved is never served from a cache.
  const fileFails = await page.evaluate(() =>
    fetch("/api/documents/00000000-0000-4000-8000-000000000000/file").then(
      () => false,
      () => true,
    ),
  );
  expect(fileFails).toBe(true);
});
