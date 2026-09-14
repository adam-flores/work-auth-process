import { defineConfig } from "@playwright/test";

/**
 * TEST-1 settles Playwright as the tool for anything that drives a rendered
 * interface. It covers what the service seam cannot express - what a person
 * actually sees - and nothing that the seam covers better.
 *
 * The browser tests get their own store so a run never resets the one a demo is
 * sitting in.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "on-first-retry" },
  webServer: {
    command: "npm run build && node src/server/index.ts",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: "3100", WORK_AUTH_STORE: ".store/e2e.db" },
  },
});
