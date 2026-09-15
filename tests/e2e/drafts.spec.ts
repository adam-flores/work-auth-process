import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * A draft, end to end (#51, ADR-0009): created, saved, reopened with what
 * was saved, and deleted without a trace. The e2e store is shared across
 * this whole file (playwright.config.ts runs one worker), so every test
 * picks a distinctive project name rather than assuming the drafts list is
 * otherwise empty.
 */

function draftRow(page: Page, project: string) {
  return page.getByTestId("draft-row").filter({ hasText: project });
}

async function newDraft(page: Page): Promise<void> {
  await page.goto("/");
  // `system` cannot submit a draft (it owns no work); a draft needs a real
  // accountable submitter, so acting as one is the first step every time.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();
}

test("a draft is created, saved with its fields, and reopened with the same values", async ({ page }) => {
  const project = "E2E Rotor Recertification";
  await newDraft(page);

  await page.getByLabel("Project").fill(project);

  const requesting = page.getByTestId("draft-requesting-department");
  await requesting.getByLabel("Search by name").fill("Rotor Hubs");
  await requesting.getByRole("button", { name: "Rotor Hubs", exact: true }).click();
  await expect(requesting.getByTestId("draft-requesting-department-selected")).toBeVisible();

  const performing = page.getByTestId("draft-performing-department");
  await performing.getByLabel("Search by name").fill("Thermal Coatings");
  await performing.getByRole("button", { name: "Thermal Coatings", exact: true }).click();
  await expect(performing.getByTestId("draft-performing-department-selected")).toBeVisible();

  await page.getByLabel("Funding type").selectOption("company-funded");
  await page.getByLabel("Requesting location type").selectOption("domestic");
  await page.getByLabel("Performing location type").selectOption("international");
  await page.getByLabel("Requesting program manager").fill("Dana Ferris");
  await page.getByLabel("Requesting finance approver").fill("Kim Osei");
  await page.getByLabel("Performing program manager").fill("Lior Amsel");
  await page.getByLabel("Performing finance approver").fill("Priya Nandan");
  await page.getByLabel("Performing-side contact (optional)").fill("Sam Whitfield");

  await page.getByLabel("Budget hours").fill("40");
  await page.getByLabel("Labor rate").fill("85.5");
  await page.getByRole("button", { name: "Add resource" }).click();
  await expect(page.getByTestId("draft-resources")).toContainText("40 hrs @ $85.5/hr");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(draftRow(page, project)).toBeVisible();

  // Reload the page entirely, so reopening proves the data came back from
  // the store rather than surviving in component state. Identity is mocked
  // per-request rather than persisted, so acting as the same submitter has
  // to be redone after a reload too.
  await page.reload();
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await draftRow(page, project).getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("draft-form")).toBeVisible();

  await expect(page.getByLabel("Project")).toHaveValue(project);
  await expect(requesting.getByTestId("draft-requesting-department-selected")).toContainText("Rotor Hubs");
  await expect(performing.getByTestId("draft-performing-department-selected")).toContainText(
    "Thermal Coatings",
  );
  await expect(page.getByLabel("Funding type")).toHaveValue("company-funded");
  await expect(page.getByLabel("Requesting location type")).toHaveValue("domestic");
  await expect(page.getByLabel("Performing location type")).toHaveValue("international");
  await expect(page.getByLabel("Requesting program manager")).toHaveValue("Dana Ferris");
  await expect(page.getByLabel("Performing-side contact (optional)")).toHaveValue("Sam Whitfield");
  await expect(page.getByTestId("draft-resources")).toContainText("40 hrs @ $85.5/hr");
});

test("a resource is removed from a draft immediately, without a save", async ({ page }) => {
  await newDraft(page);

  await page.getByLabel("Budget hours").fill("12");
  await page.getByLabel("Labor rate").fill("60");
  await page.getByRole("button", { name: "Add resource" }).click();
  await expect(page.getByTestId("draft-resources").getByTestId("draft-resource-row")).toHaveCount(1);

  await page.getByTestId("draft-resources").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("draft-resources").getByTestId("draft-resource-row")).toHaveCount(0);
});

test("the requesting and performing department may not be the same", async ({ page }) => {
  await newDraft(page);

  for (const testId of ["draft-requesting-department", "draft-performing-department"]) {
    const picker = page.getByTestId(testId);
    await picker.getByLabel("Search by name").fill("Rotor Hubs");
    await picker.getByRole("button", { name: "Rotor Hubs", exact: true }).click();
  }

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("may not be the same");
});

test("a submitter deletes their own draft, and it disappears from the list", async ({ page }) => {
  const project = "E2E Draft To Delete";
  await newDraft(page);
  await page.getByLabel("Project").fill(project);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(draftRow(page, project)).toBeVisible();

  await draftRow(page, project).getByRole("button", { name: "Open" }).click();
  await page.getByTestId("delete-draft").click();

  await expect(page.getByTestId("draft-form")).toHaveCount(0);
  await expect(draftRow(page, project)).toHaveCount(0);

  // Reopening the deleted draft's own queue (not the default `system` view,
  // which never had it) confirms it is gone from the store, not just from
  // this page's in-memory state.
  await page.reload();
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await expect(draftRow(page, project)).toHaveCount(0);
});
