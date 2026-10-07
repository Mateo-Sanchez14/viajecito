import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR";

test("task owner receives one reminder and budget shows per-person cost", async ({
  page,
  request,
}) => {
  const meResponse = await request.get("/api/me");
  expect(meResponse.ok()).toBe(true);
  const me = (await meResponse.json()) as {
    person: { id: string; phone: string };
    crews: { id: string }[];
  };
  const csrf = await request.get("/api/auth/csrf");
  const { csrf_token } = (await csrf.json()) as { csrf_token: string };
  const headers = { "X-CSRFToken": csrf_token };
  const title = `Logistics ${randomUUID()}`;
  const created = await request.post(`/api/crews/${me.crews[0].id}/trips`, {
    headers,
    data: { name: title, currency: "ARS" },
  });
  expect(created.status()).toBe(201);
  const trip = (await created.json()) as { id: string; crew_id: string };
  const base = `/crews/${trip.crew_id}/trips/${trip.id}`;
  await page.goto(`${base}/logistics`);
  await page.getByRole("button", { name: messages.logistics.task.add }).click();
  await page
    .getByLabel(messages.logistics.task.title, { exact: true })
    .fill(title);
  await page
    .getByLabel(messages.logistics.task.owner)
    .selectOption(me.person.id);
  await page
    .getByLabel(messages.logistics.due, { exact: true })
    .fill("2020-01-01");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/tasks") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: messages.logistics.save, exact: true })
    .click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByRole("checkbox", { name: title })).toBeVisible();
  // This test runs only in the parent's exclusive local compose smoke window. 15:00 UTC (noon in the
  // crew timezone) avoids quiet hours. Travel to the NEXT 15:00 UTC: travelling back in time would find
  // the tick JobLock taken at the real time still held, and the tick would exit silently.
  const script =
    "import os;os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.dev');import django,time_machine;from datetime import datetime,timedelta,UTC;django.setup();from django.core.management import call_command;\nnow=datetime.now(UTC)\nat=now.replace(hour=15,minute=0,second=0,microsecond=0)\nat=at if at>now else at+timedelta(days=1)\nwith time_machine.travel(at,tick=False): call_command('tick')";
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "api", "python", "-c", script],
    { cwd: "..", timeout: 30_000 },
  );
  const fake = process.env.FAKE_GOWA_URL ?? "http://localhost:4000";
  await expect
    .poll(async () => {
      const response = await request.get(`${fake}/__sent`);
      expect(response.ok()).toBe(true);
      const sends = (await response.json()) as { message: string }[];
      return sends.filter(
        (send) =>
          send.message.includes(title) &&
          send.message.includes(`@${me.person.phone.replace(/\D/g, "")}`),
      ).length;
    })
    .toBe(1);
  const proposal = await request.post(`/api/trips/${trip.id}/proposals`, {
    headers,
    data: {
      title: `Budget ${title}`,
      category: "lodging",
      est_price: "300",
      currency: "ARS",
      price_basis: "total",
    },
  });
  expect(proposal.status()).toBe(201);
  const { id } = (await proposal.json()) as { id: string };
  const chosen = await request.post(`/api/proposals/${id}/transition`, {
    headers,
    data: { to: "chosen" },
  });
  expect(chosen.ok()).toBe(true);
  await page.goto(`${base}/budget`);
  await expect(page.getByText(messages.budget.perPersonSuffix)).toContainText(
    "300",
  );
});
