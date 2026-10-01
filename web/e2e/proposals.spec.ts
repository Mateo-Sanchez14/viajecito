import { expect, test, type APIRequestContext } from "@playwright/test";
import messages from "../messages/es-AR";

/**
 * Needs the dev stack with `LINKPREVIEW_FETCHER=static` and fake Gowa, after
 *   make replay FIXTURE=api/proposals/tests/fixtures/gowa/group_link.json
 * so the group link already became a proposal on the crew's default trip.
 */
const phone = process.env.E2E_PHONE ?? "+54 9 11 5555 1234";
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";

// Logging in requests an OTP; a retry would hit the api's 60 s per-phone rate limit.
test.describe.configure({ retries: 0 });

type Sent = { phone?: string; message?: string; reply_message_id?: string | null };

async function latestMessage(request: APIRequestContext, digits: string): Promise<string | undefined> {
  const response = await request.get(`${fakeGowaUrl}/__sent/latest?phone=${digits}`);
  if (!response.ok()) return undefined;
  return ((await response.json()) as Sent).message;
}

/** Waits for an OTP message newer than `previous` and returns its 6-digit code. */
async function readNewCode(request: APIRequestContext, digits: string, previous?: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const message = await latestMessage(request, digits);
        if (!message || message === previous) return undefined;
        code = /\b(\d{6})\b/.exec(message)?.[1];
        return code;
      },
      { timeout: 15_000 },
    )
    .toBeDefined();
  return code as string;
}

test("a link captured from the group shows up on the web and can be voted", async ({ page, request }) => {
  // The replay left one card threaded to the inbound message. Read it before logging in:
  // the login adds its own (unthreaded) OTP message to the same log.
  const sent = (await (await request.get(`${fakeGowaUrl}/__sent`)).json()) as Sent[];
  const cards = sent.filter((entry) => entry.reply_message_id);
  expect(cards).toHaveLength(1);

  const digits = phone.replace(/\D/g, "");
  const previous = await latestMessage(request, digits);
  await page.goto("/login");
  await page.getByLabel(messages.auth.phone.label).fill(phone);
  await page.getByRole("button", { name: messages.auth.phone.submit }).click();
  await expect(page.getByLabel(messages.auth.code.label)).toBeVisible();
  await page.getByLabel(messages.auth.code.label).fill(await readNewCode(request, digits, previous));
  await page.getByRole("button", { name: messages.auth.code.submit }).click();
  await expect(page.getByText(messages.home.greeting.replace("{name}", "").trim())).toBeVisible();

  await page.locator('a[href*="/trips/"]').first().click();
  await page.getByRole("link", { name: messages.trips.modules.proposals, exact: true }).first().click();

  const list = page.getByRole("list", { name: messages.proposals.title });
  await expect(list.getByRole("listitem")).toHaveCount(1);

  await list.getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const up = page.getByRole("group", { name: messages.proposals.vote.label }).getByRole("button").first();
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
});
