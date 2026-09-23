import { defineConfig } from "@playwright/test";

/**
 * Prototype-lite is a single HTML file opened from disk, so this config has no
 * webServer: it must never build or boot the full prototype's Node app, which
 * is exactly the infrastructure lite is forbidden to depend on (#99). Each test
 * gets a fresh browser context, so every test starts from the seed.
 */
export default defineConfig({
  testDir: "tests/lite",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "on-first-retry" },
});
