import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The four mandatory acknowledgements, and the performing claim (#56), end
 * to end: the whole mandatory relay, walked from initiation through the
 * performing department's claim to the last of the four acknowledgements -
 * requesting program manager, requesting finance, the performing
 * department's claim and contribution, performing program manager,
 * performing finance. No stage begins before the previous one closes. The
 * e2e store is shared across this whole file (playwright.config.ts runs one
 * worker), same discipline as queues.spec.ts.
 */

async function initiateCompleteAuthorization(page: Page, project: string): Promise<void> {
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

async function acknowledgeAsCurrentParticipant(page: Page, project: string): Promise<void> {
  const row = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await row.getByRole("button", { name: "Open" }).click();
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);
}

test("the whole mandatory relay is walkable end to end", async ({ page }) => {
  // Distinctive and rerun-safe, same reasoning as queues.spec.ts: an
  // authorization this test leaves pending stays in a queue forever.
  const project = `E2E Mandatory Relay ${Date.now()}`;
  await initiateCompleteAuthorization(page, project);

  // Requesting program manager, then requesting finance - both route to the
  // same department, so the same Approver acts on each in turn.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await acknowledgeAsCurrentParticipant(page, project);
  await acknowledgeAsCurrentParticipant(page, project);

  // The authorization now sits at the performing department's contribution
  // stage - out of the requesting Approver's queue entirely.
  await expect(
    page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project }),
  ).toHaveCount(0);

  // A Contributor in the performing department sees it, unclaimed.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-jordan-hale");
  const contributorQueue = page.getByTestId("my-queue");
  const unclaimedRow = contributorQueue.getByTestId("queue-row").filter({ hasText: project });
  await expect(unclaimedRow).toBeVisible();
  await expect(unclaimedRow.getByTestId("claim-status")).toHaveText("Unclaimed");

  await unclaimedRow.getByRole("button", { name: "Open" }).click();
  const claimDetail = page.getByTestId("queue-item-detail");
  await expect(claimDetail.getByTestId("queue-item-stage")).toContainText("ownership");
  await claimDetail.getByTestId("claim").click();

  // Claiming does not resolve the stage - the item stays open and in the
  // same department's queue, now showing as claimed.
  await expect(claimDetail).toBeVisible();
  await expect(claimDetail.getByTestId("claim-status")).toHaveText("Claimed");

  // The claimant fills the performing-side section: the employee who will
  // perform the work - a name on the record, not a participant in the
  // process.
  await claimDetail.getByLabel("Employee performing the work").fill("Priya Okonjo");
  await claimDetail.getByTestId("contribute").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Contributing resolves the stage - it leaves the performing department's
  // contribution queue.
  await expect(
    contributorQueue.getByTestId("queue-row").filter({ hasText: project }),
  ).toHaveCount(0);

  // Performing program manager, then performing finance - the last two of
  // the four mandatory acknowledgements, at the performing department.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-marcus-oduya");
  const approverQueue = page.getByTestId("my-queue");
  const performingRow = approverQueue.getByTestId("queue-row").filter({ hasText: project });
  await expect(performingRow).toBeVisible();
  await performingRow.getByRole("button", { name: "Open" }).click();
  const performingDetail = page.getByTestId("queue-item-detail");
  await expect(performingDetail).toContainText("Priya Okonjo");
  await performingDetail.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  await acknowledgeAsCurrentParticipant(page, project);

  // The relay has run every mandatory stage - requesting program manager,
  // requesting finance, the performing department's claim, performing
  // program manager, performing finance - and now sits at a gate #57 has
  // not built yet, so it is in nobody's queue.
  await expect(
    approverQueue.getByTestId("queue-row").filter({ hasText: project }),
  ).toHaveCount(0);
});
