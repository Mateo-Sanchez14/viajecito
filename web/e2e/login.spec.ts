import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR";

// Not E2E_PHONE: auth.setup.ts logs that one in, and a second OTP request for the same phone would
// invalidate its code and hit the 60 s rate limit. Must be a member too (see the Makefile `e2e`).
const phone = process.env.E2E_LOGIN_PHONE ?? "+5491100000002";
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";

// A retry would re-request a code inside the api's 60 s per-phone rate limit and get a 429.
test.describe.configure({ retries: 0 });
// This spec exercises the login itself, so it starts anonymous.
test.use({ storageState: { cookies: [], origins: [] } });

/** Polls fake Gowa until the OTP message for `phone` exists and returns its 6-digit code. */
async function readCode(
  request: import("@playwright/test").APIRequestContext,
  digits: string,
  previous?: string,
): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${fakeGowaUrl}/__sent/latest?phone=${digits}`,
        );
        if (!response.ok()) return undefined;
        // Match on `message` only: `received_at` carries 6-digit microseconds.
        const { id, message } = (await response.json()) as { id: string; message?: string };
        if (id === previous) return undefined;
        code = /\b(\d{6})\b/.exec(message ?? "")?.[1];
        return code;
      },
      { timeout: 15_000 },
    )
    .toBeDefined();
  return code as string;
}

test("logs in with the WhatsApp code read from fake gowa", async ({
  page,
  request,
}) => {
  // Snapshot this phone only; parallel specs rely on the other outbound messages.
  const digits = phone.replace(/\D/g, "");
  const previousResponse = await request.get(`${fakeGowaUrl}/__sent/latest?phone=${digits}`);
  const previous = previousResponse.ok()
    ? ((await previousResponse.json()) as { id: string }).id
    : undefined;

  await page.goto("/login");

  await page.getByLabel(messages.auth.phone.label).fill(phone);
  await page.getByRole("button", { name: messages.auth.phone.submit }).click();

  await expect(page.getByLabel(messages.auth.code.label)).toBeVisible();
  const code = await readCode(request, digits, previous);
  await page.getByLabel(messages.auth.code.label).fill(code);
  await page.getByRole("button", { name: messages.auth.code.submit }).click();

  // The greeting copy minus the interpolated name, e.g. "Hola, ".
  const greeting = messages.home.greeting.replace("{name}", "").trim();
  await expect(page.getByText(greeting)).toBeVisible();
});
