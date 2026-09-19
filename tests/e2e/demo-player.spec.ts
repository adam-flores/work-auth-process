import { test, expect } from "@playwright/test";

/**
 * The scripted demo player's control bar (#94): a thin smoke test proving
 * Start, Pause, Continue and Reset each produce visible change end to end.
 * The step-by-step story itself - every command the script calls, the
 * correction raised and corrected in place, reaching Completed - is proven
 * directly against the runner (`tests/demo/runner.test.ts`), not through
 * browser timing, per #94's own testing decisions.
 *
 * The e2e store is shared across this whole suite (`playwright.config.ts`
 * runs one worker) - `insights.spec.ts` documents the same constraint and
 * asserts only relative change for exactly this reason. Reset here clears
 * process data store-wide (`ReseedOptions.wipeProcessData`), which this
 * suite already tolerates: nothing elsewhere asserts an absolute count.
 */

test("Start, Pause, Continue and Reset each produce visible change", async ({ page }) => {
  await page.goto("/");

  const status = page.getByTestId("demo-status");
  await expect(status).toContainText("idle");

  await page.getByTestId("demo-start").click();
  await expect(status).toContainText("running");

  // Start runs the first step immediately rather than waiting for the
  // first pacing interval (#94 follow-up: a presenter clicking Start needs
  // something on screen right away), and it switches the presenter's
  // screen to the tab the story's first beat names.
  await expect(page.getByTestId("demo-narration")).toBeVisible({ timeout: 2000 });
  await expect(page.getByRole("tab", { name: "Submit", selected: true })).toBeVisible();

  await page.getByTestId("demo-pause").click();
  await expect(status).toContainText("paused");

  await page.getByTestId("demo-continue").click();
  await expect(status).toContainText("running");

  await page.getByTestId("demo-reset").click();
  await expect(status).toContainText("idle");
  await expect(page.getByTestId("demo-narration")).toHaveCount(0);
});
