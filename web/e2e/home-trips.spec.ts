import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR";

// Starts signed in (storage state from auth.setup.ts); trips are unique per run.
test("the home groups trips into cards with a destination picture, a countdown and the group size", async ({
  page,
  request,
}) => {
  const me = (await (await request.get("/api/me")).json()) as { crews: { id: string }[] };
  const { csrf_token } = (await (await request.get("/api/auth/csrf")).json()) as { csrf_token: string };
  const headers = { "X-CSRFToken": csrf_token };
  const crewId = me.crews[0].id;
  const make = async (data: Record<string, unknown>) => {
    const response = await request.post(`/api/crews/${crewId}/trips`, { headers, data });
    expect(response.status()).toBe(201);
  };
  const tag = randomUUID().slice(0, 8);
  // Two dated trips: the earlier one is the hero's featured trip, the later one is a card.
  await make({ name: `Cerca ${tag}`, start_on: "2098-01-10", end_on: "2098-01-12", currency: "ARS" });
  await make({
    name: `Playa ${tag}`,
    start_on: "2099-01-10",
    end_on: "2099-01-17",
    destination_label: "Mar del Plata",
    currency: "ARS",
  });
  await make({ name: `Idea ${tag}`, currency: "ARS" });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 2, name: messages.trips.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: messages.trips.sections.upcoming })).toBeVisible();
  await expect(page.getByRole("heading", { name: messages.trips.sections.undated })).toBeVisible();

  const beach = page.getByRole("link", { name: new RegExp(`Playa ${tag}`) });
  await expect(beach).toBeVisible();
  // The destination points to the beach still, never a random scene.
  await expect(beach.locator("img[data-scene='beach']")).toHaveAttribute("src", /\/ambient\/beach\..+\.webp$/);
  await expect(beach.locator(".trip-card-pill")).toHaveText(/^en [\d.]+ días$/);
  await expect(beach.locator(".avatar-stack-label")).toHaveText(/\d+ personas?/);

  // The undated idea sits in its own group, without a countdown.
  const idea = page.getByRole("link", { name: new RegExp(`Idea ${tag}`) });
  await expect(idea).toBeVisible();
  await expect(idea.locator(".trip-card-pill")).toHaveCount(0);

  // No ops card for regular users, and the way home greets once.
  await expect(page.getByText(messages.ops.health.title)).toHaveCount(0);
  await expect(page.locator(".app-greeting")).toBeHidden();
});

test("the new-trip sheet suggests a name from the destination and shows its picture", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: messages.trips.create.open, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: messages.trips.create.title });
  await expect(sheet.getByLabel(messages.trips.create.destination)).toBeFocused();

  await sheet.getByLabel(messages.trips.create.destination).fill("Bariloche");
  await expect(sheet.getByLabel(messages.trips.create.name)).toHaveValue("Bariloche");
  await expect(sheet.locator("img[data-scene='snow']")).toBeVisible();

  await sheet.getByRole("button", { name: messages.trips.create.close }).click();
  await expect(sheet).toBeHidden();
});
