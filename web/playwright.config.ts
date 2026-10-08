import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: the login spec requests OTPs, and a retry would hit the api's 60 s rate limit.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Logs in once and saves the session; every other spec starts from it (never log in in a spec).
    // reducedMotion: view-transition groups are not hit-testable while they run, so e2e never animates
    // (and never requests the ambient video).
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { reducedMotion: "reduce" } },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json", reducedMotion: "reduce" },
    },
  ],
});
