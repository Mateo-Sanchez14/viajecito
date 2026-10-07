import { expect, test as setup } from "@playwright/test";
import messages from "../messages/es-AR";

export const authFile = "e2e/.auth/user.json";

const phone = process.env.E2E_PHONE ?? "+54 9 11 5555 1234";
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";

// The only place that logs in with E2E_PHONE: a second OTP request for the same phone would
// invalidate this code and hit the api's 60 s per-phone rate limit.
setup.describe.configure({ retries: 0 });

setup("sign in once and save the storage state", async ({ page, request }) => {
  // Snapshot this phone only; never clear the shared outbound ledger.
  const digits = phone.replace(/\D/g, "");
  const previousResponse = await request.get(`${fakeGowaUrl}/__sent/latest?phone=${digits}`);
  const previous = previousResponse.ok()
    ? ((await previousResponse.json()) as { id: string }).id
    : undefined;

  await page.goto("/login");
  await page.getByLabel(messages.auth.phone.label).fill(phone);
  await page.getByRole("button", { name: messages.auth.phone.submit }).click();
  await expect(page.getByLabel(messages.auth.code.label)).toBeVisible();

  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${fakeGowaUrl}/__sent/latest?phone=${digits}`);
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

  await page.getByLabel(messages.auth.code.label).fill(code as string);
  await page.getByRole("button", { name: messages.auth.code.submit }).click();
  await expect(page.getByRole("button", { name: messages.auth.logout, exact: true })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
