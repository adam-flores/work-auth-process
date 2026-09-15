import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Field guidance and validation at entry (#52). Shares the e2e store with
 * every other spec in this directory (one worker), so each test opens its
 * own fresh draft rather than assuming the drafts list is otherwise empty.
 */

async function newDraft(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();
}

async function selectDepartment(page: Page, pickerTestId: string, name: string): Promise<void> {
  const picker = page.getByTestId(pickerTestId);
  await picker.getByLabel("Search by name").fill(name);
  await picker.getByRole("button", { name, exact: true }).click();
  await expect(picker.getByTestId(`${pickerTestId}-selected`)).toBeVisible();
}

test("field guidance is visible at the point of entry, before anything is filled in", async ({ page }) => {
  await newDraft(page);

  // Nothing has been typed or selected yet - guidance is not conditional on
  // an error, a focus, or a hover; it stands at the point of entry.
  await expect(page.getByTestId("guidance-project")).toBeVisible();
  await expect(page.getByTestId("guidance-project")).toContainText("Name the work as one ask");

  await expect(page.getByTestId("guidance-requestingDepartmentId")).toBeVisible();
  await expect(page.getByTestId("guidance-requestingDepartmentId")).toContainText("your own department");

  await expect(page.getByTestId("guidance-performingDepartmentId")).toBeVisible();
  await expect(page.getByTestId("guidance-fundingType")).toBeVisible();
  await expect(page.getByTestId("guidance-requestingLocationType")).toBeVisible();
  await expect(page.getByTestId("guidance-performingLocationType")).toBeVisible();
  await expect(page.getByTestId("guidance-requestingProgramManager")).toBeVisible();
  await expect(page.getByTestId("guidance-requestingFinanceApprover")).toBeVisible();
  await expect(page.getByTestId("guidance-performingProgramManager")).toBeVisible();
  await expect(page.getByTestId("guidance-performingFinanceApprover")).toBeVisible();

  await expect(page.getByTestId("guidance-performingContact")).toBeVisible();
  await expect(page.getByTestId("guidance-performingContact")).toContainText("Optional");

  await expect(page.getByTestId("guidance-resources")).toBeVisible();
  await expect(page.getByTestId("guidance-resources")).toContainText("At least one is required");
});

test("validation fires before submission, without a round trip to the service", async ({ page }) => {
  const project = "E2E Same Department Refusal";
  await newDraft(page);
  await page.getByLabel("Project").fill(project);

  // The same department on both sides is refused by the shared rule module
  // (DraftFields) - picking it is enough to make the draft invalid, before
  // "Save" is ever clicked.
  await selectDepartment(page, "draft-requesting-department", "Rotor Hubs");
  await selectDepartment(page, "draft-performing-department", "Rotor Hubs");

  let saveRequestFired = false;
  await page.route("**/api/drafts/**", async (route) => {
    if (route.request().method() === "PATCH") saveRequestFired = true;
    await route.continue();
  });

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "The requesting and performing department may not be the same.",
  );
  // Caught by the browser's own copy of the rule, not by a response from
  // the service the click never reached.
  expect(saveRequestFired).toBe(false);
});
