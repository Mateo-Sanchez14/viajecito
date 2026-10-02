import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR";

test("a scheduled meeting point appears in Today", async ({
  page,
  request,
}) => {
  // Reuse the setup session; requesting a new OTP would invalidate other specs.
  const meResponse = await request.get("/api/me");
  expect(meResponse.ok()).toBe(true);
  const me = await meResponse.json();
  const csrfResponse = await request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);
  const { csrf_token } = await csrfResponse.json();
  const headers = { "X-CSRFToken": csrf_token };
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const tripResponse = await request.post(
    `/api/crews/${me.crews[0].id}/trips`,
    {
      headers,
      data: { name: `Today e2e ${randomUUID()}`, start_on: date, end_on: date },
    },
  );
  expect(tripResponse.status()).toBe(201);
  const trip = await tripResponse.json();
  const title = `Meeting ${randomUUID()}`;
  const entryResponse = await request.post(
    `/api/trips/${trip.id}/itinerary/entries`,
    {
      headers,
      data: {
        title,
        kind: "meeting",
        day_date: date,
        start_time: "23:59",
        is_meeting_point: true,
        location_label: "Base",
        lat: -41,
        lng: -71,
      },
    },
  );
  expect(entryResponse.status()).toBe(201);
  await page.goto(`/crews/${trip.crew_id}/trips/${trip.id}/today`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: messages.today.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: messages.today.meetingPoint }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: messages.today.timeline }),
  ).toContainText(title);
  await expect(
    page.getByRole("link", { name: messages.today.map }),
  ).toHaveAttribute("href", "https://www.openstreetmap.org/?mlat=-41&mlon=-71");
});
