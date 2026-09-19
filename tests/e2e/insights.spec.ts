import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The insights dashboard (#66, BDR-0006, ADR-0006): every figure a fold over
 * the same transition log the rest of the product writes, so a live
 * walkthrough's own clicking moves the numbers (ADR-0006: "the demo's own
 * clicking appends to the same log, so a walkthrough moves the numbers").
 * Exact totals are not asserted - the e2e store is shared across this whole
 * suite (`playwright.config.ts` runs one worker), the same reason
 * `master-dashboard.spec.ts` stops at "not asserted down to a total row
 * count" - so this proves the property that matters: raising a correction
 * against a fresh authorization moves M3's total by exactly one, and its
 * denominator by exactly one, without needing to know what either started
 * at. The precise fold arithmetic (M1, M2, held time, the stage
 * decomposition) is `tests/service/insights.test.ts`'s job.
 */

async function initiateAuthorization(
  page: Page,
  options: { submitter: string; project: string; requestingDepartment: string; performingDepartment: string },
): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption(options.submitter);
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();

  await page.getByLabel("Project").fill(options.project);

  const requesting = page.getByTestId("draft-requesting-department");
  await requesting.getByLabel("Search by name").fill(options.requestingDepartment);
  await requesting.getByRole("button", { name: options.requestingDepartment, exact: true }).click();

  const performing = page.getByTestId("draft-performing-department");
  await performing.getByLabel("Search by name").fill(options.performingDepartment);
  await performing.getByRole("button", { name: options.performingDepartment, exact: true }).click();

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

  await page.getByTestId("initiate-draft").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("draft-form")).toHaveCount(0);
}

test("the insights dashboard renders every headline measure, and a live correction request moves M3", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "Insights" }).click();

  const insights = page.getByTestId("insights-dashboard");
  await expect(insights).toBeVisible();
  await expect(insights.getByTestId("insights-m1")).toBeVisible();
  await expect(insights.getByTestId("insights-m2")).toBeVisible();
  await expect(insights.getByTestId("insights-m3")).toBeVisible();
  await expect(insights.getByTestId("insights-stage-table")).toBeVisible();
  await expect(insights.getByTestId("insights-stage-row").first()).toBeVisible();

  const totalBefore = Number(await insights.getByTestId("insights-m3-total-correction-requests").textContent());
  const countBefore = Number(await insights.getByTestId("insights-m3-authorization-count").textContent());

  // A submitter and pairing this spec does not share with any other e2e
  // file's exact-emptiness assertion (`queues.spec.ts` checks that
  // "p-jordan-hale" - the Contributor every other spec defaults to for a
  // clean queue - has nothing waiting at all): this authorization is
  // deliberately left with an outstanding, submitter-addressed correction
  // request, which stays in its submitter's queue for the rest of the run.
  const project = `Insights E2E ${Date.now()}`;
  await initiateAuthorization(page, {
    submitter: "p-teo-brandt",
    project,
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Landing Gear Systems",
  });

  // The requesting-program-manager approver at Rotor Assemblies raises a
  // correction against the authorization that just arrived, rather than
  // acknowledging it.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await page
    .getByTestId("my-queue")
    .getByTestId("queue-row")
    .filter({ hasText: project })
    .getByRole("button", { name: "Open" })
    .click();
  const detail = page.getByTestId("queue-item-detail");
  await detail.getByTestId("open-request-correction").click();
  await detail.getByTestId("correction-field-project").check();
  await detail.getByTestId("correction-comment").fill("Please confirm the project name.");
  await detail.getByTestId("submit-request-correction").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(insights.getByTestId("insights-m3-total-correction-requests")).toHaveText(String(totalBefore + 1));
  await expect(insights.getByTestId("insights-m3-authorization-count")).toHaveText(String(countBefore + 1));
});
