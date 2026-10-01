import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR.json";

const phone = process.env.E2E_PHONE ?? "+54 9 11 5555 1234";
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";

/** Polls fake Gowa until the OTP message for `phone` exists and returns its 6-digit code. */
async function readCode(
  request: import("@playwright/test").APIRequestContext,
  digits: string,
): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${fakeGowaUrl}/__sent/latest?phone=${digits}`,
        );
        if (!response.ok()) return undefined;
        code = /\b(\d{6})\b/.exec(await response.text())?.[1];
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
  await page.goto("/login");

  await page.getByLabel(messages.auth.phone.label).fill(phone);
  await page.getByRole("button", { name: messages.auth.phone.submit }).click();

  const code = await readCode(request, phone.replace(/\D/g, ""));
  await page.getByLabel(messages.auth.code.label).fill(code);
  await page.getByRole("button", { name: messages.auth.code.submit }).click();

  await expect(page.getByText(/Hola,/)).toBeVisible();
});
