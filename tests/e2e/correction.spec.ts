import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Correction request and correction in place (#59), end to end: an Approver
 * reports a problem with a field, the authorization leaves their queue
 * without moving, the submitter supplies the fix from their own queue, and
 * the same Approver resumes exactly where they left it. The e2e store is
 * shared across this whole file (playwright.config.ts runs one worker), same
 * discipline as performing-claim.spec.ts.
 */

async function initiateAuthorization(page: Page, project: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();

  await page.getByLabel("Project").fill(project);

  const requesting = page.getByTestId("draft-requesting-department");
  await requesting.getByLabel("Search by name").fill("Rotor Assemblies");
  await requesting.getByRole("button", { name: "Rotor Assemblies", exact: true }).click();

  const performing = page.getByTestId("draft-performing-department");
  await performing.getByLabel("Search by name").fill("Flight Controls Software");
  await performing.getByRole("button", { name: "Flight Controls Software", exact: true }).click();

  await page.getByLabel("Funding type").selectOption("company-funded");
  await page.getByLabel("Requesting location type").selectOption("domestic");
  await page.getByLabel("Performing location type").selectOption("domestic");
  await page.getByLabel("Requesting program manager").fill("Dana Ferris");
  await page.getByLabel("Requesting finance approver").fill("Kim Osei");
  await page.getByLabel("Performing program manager").fill("Lior Amsel");
  await page.getByLabel("Performing finance approver").fill("Priya Nandan");

  await page.getByLabel("Budget hours").fill("40");
  await page.getByLabel("Labor rate").fill("85.5");
  await page.getByRole("button", { name: "Add resource" }).click();
  await expect(page.getByTestId("draft-resources")).toContainText("40 hrs @ $85.5/hr");

  await page.getByTestId("initiate-draft").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("draft-form")).toHaveCount(0);
}

test("an approver reports a problem, the submitter corrects it, and the approver resumes", async ({ page }) => {
  // Distinctive and rerun-safe, same reasoning as performing-claim.spec.ts:
  // an authorization this test leaves pending stays in a queue forever.
  const project = `E2E Correction ${Date.now()}`;
  await initiateAuthorization(page, project);

  // The requesting program manager approver finds the project name wrong
  // and raises a correction request instead of acknowledging it.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  await page.getByRole("tab", { name: "My Queue" }).click();
  const approverQueue = page.getByTestId("my-queue");
  const row = approverQueue.getByTestId("queue-row").filter({ hasText: project });
  await row.getByRole("button", { name: "Open" }).click();

  const detail = page.getByTestId("queue-item-detail");
  await detail.getByTestId("open-request-correction").click();
  await detail.getByTestId("correction-field-project").check();
  await detail.getByTestId("correction-comment").fill("The project name is wrong.");
  await detail.getByTestId("submit-request-correction").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // It has left the approver's queue entirely - they cannot act on it.
  await expect(approverQueue.getByTestId("queue-row").filter({ hasText: project })).toHaveCount(0);

  // It sits in the submitter's queue, marked as awaiting correction.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  const submitterQueue = page.getByTestId("my-queue");
  const correctionRow = submitterQueue.getByTestId("queue-row").filter({ hasText: project });
  await expect(correctionRow).toBeVisible();
  await expect(correctionRow.getByTestId("awaiting-correction")).toBeVisible();

  const correctedProject = `${project} (corrected)`;
  await correctionRow.getByRole("button", { name: "Open" }).click();
  const fulfillmentForm = page.getByTestId("correction-fulfillment-form");
  await expect(fulfillmentForm).toContainText("The project name is wrong.");
  await fulfillmentForm.getByTestId("correction-field-value-project").fill(correctedProject);
  await fulfillmentForm.getByTestId("submit-correction").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Resolved: it has left the submitter's queue.
  await expect(
    submitterQueue.getByTestId("queue-row").filter({ hasText: correctedProject }),
  ).toHaveCount(0);

  // The same approver resumes at exactly the stage they left it, and can
  // now acknowledge it normally.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  const resumedRow = approverQueue.getByTestId("queue-row").filter({ hasText: correctedProject });
  await expect(resumedRow).toBeVisible();
  await resumedRow.getByRole("button", { name: "Open" }).click();
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);
});
