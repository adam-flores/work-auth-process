import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Re-review, both causes, one mechanism (#60), end to end: a correction to
 * "project" - a field the requesting program manager's already-resolved
 * stage depends on (`relay/config.ts`) - returns the authorization there as
 * a re-review, distinct in the queue from a fresh arrival, and resolving it
 * resumes forward to exactly where the authorization already was. The
 * configuration-change cause has no live trigger by design, so it is
 * covered only at the service layer (`tests/service/re-review.test.ts`),
 * not here. The e2e store is shared across this whole file
 * (playwright.config.ts runs one worker), same discipline as
 * correction.spec.ts.
 */

async function initiateAuthorization(page: Page, project: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();

  await page.getByLabel("Project").fill(project);

  const requesting = page.getByTestId("draft-requesting-department");
  await requesting.getByLabel("Search by name").fill("Heat Exchange Products");
  await requesting.getByRole("button", { name: "Heat Exchange Products", exact: true }).click();

  const performing = page.getByTestId("draft-performing-department");
  await performing.getByLabel("Search by name").fill("Rotor Hubs");
  await performing.getByRole("button", { name: "Rotor Hubs", exact: true }).click();

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

async function acknowledgeAsCurrentParticipant(page: Page, project: string): Promise<void> {
  const row = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await row.getByRole("button", { name: "Open" }).click();
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);
}

test("a correction reaching an already-resolved stage returns it there as a re-review, and resuming it re-progresses forward", async ({
  page,
}) => {
  // Distinctive and rerun-safe, same reasoning as correction.spec.ts: an
  // authorization this test leaves pending stays in a queue forever.
  const project = `E2E Re-review ${Date.now()}`;
  await initiateAuthorization(page, project);

  // Walk to performing-finance: requesting program manager, requesting
  // finance, the performing department claims and contributes, performing
  // program manager.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await acknowledgeAsCurrentParticipant(page, project);
  await acknowledgeAsCurrentParticipant(page, project);

  await page.getByLabel("Participant", { exact: true }).selectOption("p-nils-oyelaran");
  const claimRow = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await claimRow.getByRole("button", { name: "Open" }).click();
  const claimDetail = page.getByTestId("queue-item-detail");
  await claimDetail.getByTestId("claim").click();
  await claimDetail.getByLabel("Employee performing the work").fill("Priya Okonjo");
  await claimDetail.getByTestId("contribute").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  await page.getByLabel("Participant", { exact: true }).selectOption("p-mira-devane");
  await acknowledgeAsCurrentParticipant(page, project);

  // Now at performing-finance. Raise a correction against "project" - a
  // dependency of requesting-program-manager, already resolved.
  const performingFinanceRow = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await performingFinanceRow.getByRole("button", { name: "Open" }).click();
  const detail = page.getByTestId("queue-item-detail");
  await detail.getByTestId("open-request-correction").click();
  await detail.getByTestId("correction-field-project").check();
  await detail.getByTestId("correction-comment").fill("The project name changed.");
  await detail.getByTestId("submit-request-correction").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // The submitter supplies the fix.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  const submitterQueue = page.getByTestId("my-queue");
  const correctionRow = submitterQueue.getByTestId("queue-row").filter({ hasText: project });
  await expect(correctionRow).toBeVisible();
  const correctedProject = `${project} (corrected)`;
  await correctionRow.getByRole("button", { name: "Open" }).click();
  const fulfillmentForm = page.getByTestId("correction-fulfillment-form");
  await fulfillmentForm.getByTestId("correction-field-value-project").fill(correctedProject);
  await fulfillmentForm.getByTestId("submit-correction").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // "project" is also performing-program-manager's own declared dependency
  // (relay/config.ts), so both it and requesting-program-manager - the two
  // already-resolved stages that depend on it - return as re-reviews, in
  // relay order. Requesting-program-manager first.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  const reviewerQueue = page.getByTestId("my-queue");
  const reReviewRow = reviewerQueue.getByTestId("queue-row").filter({ hasText: correctedProject });
  await expect(reReviewRow).toBeVisible();
  await expect(reReviewRow.getByTestId("re-review")).toContainText("a correction changed this");

  await reReviewRow.getByRole("button", { name: "Open" }).click();
  const reviewDetail = page.getByTestId("queue-item-detail");
  await expect(reviewDetail.getByTestId("re-review-notice")).toContainText(
    "A correction changed a field this stage depends on.",
  );
  await reviewDetail.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Then performing-program-manager, also as a re-review - the performing
  // Approver who already signed off is asked again rather than the
  // authorization silently skipping past them.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-mira-devane");
  const performingQueue = page.getByTestId("my-queue");
  const secondReReviewRow = performingQueue.getByTestId("queue-row").filter({ hasText: correctedProject });
  await expect(secondReReviewRow).toBeVisible();
  await expect(secondReReviewRow.getByTestId("re-review")).toContainText("a correction changed this");
  await secondReReviewRow.getByRole("button", { name: "Open" }).click();
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // It resumes exactly where the correction was raised - performing-finance,
  // still awaiting its own original, never-given acknowledgement - and this
  // time as a plain arrival, not a third re-review: nothing about
  // performing-finance's own dependency ("resources") was ever touched.
  const resumedRow = performingQueue.getByTestId("queue-row").filter({ hasText: correctedProject });
  await expect(resumedRow).toBeVisible();
  await expect(resumedRow.getByTestId("re-review")).toHaveCount(0);
});
