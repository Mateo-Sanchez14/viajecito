import { expect, test } from "@playwright/test";
import messages from "../messages/es-AR.json";

test("an anonymous visit to / lands on the login page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: messages.auth.heading }),
  ).toBeVisible();
});
