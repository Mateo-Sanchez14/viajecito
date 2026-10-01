import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { paths } from "../src/shared/api/schema";
import messages from "../messages/es-AR";

/** Dev stack: static previews, fake Gowa and the webhook secret from .env.example. */
const fakeGowaUrl = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8000";
const webhookSecret = process.env.E2E_WEBHOOK_SECRET ?? "dev-webhook-secret";
const chatId = process.env.E2E_CHAT_ID ?? "120363000000000000@g.us";

type Me = paths["/api/me"]["get"]["responses"][200]["content"]["application/json"];
type Sent = { message?: string; reply_message_id?: string | null };

test("a link captured from the group shows up on the web and can be voted", async ({ page, request }) => {
  // Use the setup session. Re-requesting its OTP would invalidate shared authentication.
  const meResponse = await request.get("/api/me");
  expect(meResponse.ok()).toBe(true);
  const me = (await meResponse.json()) as Me;
  const crew = me.crews[0];
  expect(crew).toBeDefined();

  if (!crew.default_trip_id) {
    const csrfResponse = await request.get("/api/auth/csrf");
    expect(csrfResponse.ok()).toBe(true);
    const { csrf_token } = (await csrfResponse.json()) as { csrf_token: string };
    const tripResponse = await request.post(`/api/crews/${crew.id}/trips`, {
      headers: { "X-CSRFToken": csrf_token },
      data: { name: `Proposals e2e ${randomUUID()}` },
    });
    expect(tripResponse.status()).toBe(201);
  }

  // Another spec may have created the first trip; capture targets the crew's actual default.
  const refreshedMeResponse = await request.get("/api/me");
  expect(refreshedMeResponse.ok()).toBe(true);
  const refreshedMe = (await refreshedMeResponse.json()) as Me;
  const tripId = refreshedMe.crews.find((entry) => entry.id === crew.id)?.default_trip_id;
  expect(tripId).toBeTruthy();

  const inboundId = `e2e-link-${randomUUID()}`;
  const payload = JSON.stringify({
    event: "message",
    device_id: "e2e-gowa",
    payload: {
      id: inboundId,
      chat_id: chatId,
      from: `${me.person.phone.replace(/\D/g, "")}@s.whatsapp.net`,
      from_name: "E2E Admin",
      timestamp: new Date().toISOString(),
      is_from_me: false,
      body: `https://www.booking.com/hotel/ar/e2e-${randomUUID()}.html`,
    },
  });
  const signature = createHmac("sha256", webhookSecret).update(payload).digest("hex");
  const webhookResponse = await request.post(`${apiUrl}/hooks/gowa/`, {
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
    data: payload,
  });
  expect(webhookResponse.ok()).toBe(true);
  expect(await webhookResponse.json()).toEqual({ status: "accepted" });

  // Processing is async. Wait for precisely this inbound message, not a global ledger count.
  await expect.poll(async () => {
    const response = await request.get(`${fakeGowaUrl}/__sent`);
    expect(response.ok()).toBe(true);
    const sent = (await response.json()) as Sent[];
    return sent.filter((entry) => entry.reply_message_id === inboundId);
  }, { timeout: 15_000 }).toHaveLength(1);

  await page.goto(`/crews/${crew.id}/trips/${tripId}/proposals`);
  const list = page.getByRole("list", { name: messages.proposals.title });
  await expect(list.getByRole("listitem")).toHaveCount(1);

  const proposalLink = list.getByRole("link").first();
  const proposalTitle = await proposalLink.innerText();
  await proposalLink.click();
  await page.waitForURL(/\/proposals\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: proposalTitle, exact: true })).toBeVisible();
  const up = page.getByRole("group", { name: messages.proposals.vote.label }).getByRole("button").first();
  const voteSaved = page.waitForResponse((response) =>
    response.url().endsWith("/vote") && response.request().method() === "PUT",
  );
  await up.click();
  expect((await voteSaved).ok()).toBe(true);
  await page.reload();
  await expect(up).toHaveAttribute("aria-pressed", "true");
});
