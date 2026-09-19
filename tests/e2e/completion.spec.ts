import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Charge number, completion, and the classification freeze (#58), end to
 * end - adapted for the demo catalog (#92).
 *
 * The original version of this file walked one authorization through the
 * four mandatory acknowledgements, both gates actually running, and the
 * Charge Number Admin minting the charge number that completes it - all in
 * one relay. That is no longer possible against the 5-person demo roster:
 * `config/participants.json`'s own readme says neither the Contracts nor
 * the Global Trade gate has a seeded Approver ("adding one is a small
 * addition if a later demo script needs a gate to fire"), and #92 gives no
 * route to seed one from an e2e spec (the department picker only resolves
 * against the org hierarchy; participants are not administrable from the
 * running app). Once an authorization reaches either gate here, it is
 * permanently stuck - nobody's queue will ever surface it - so a single
 * relay can no longer both run a gate and reach the charge number.
 *
 * What follows instead is three narrower, still-faithful checks: that the
 * Contracts gate is reachable and shows on the record, that the Global
 * Trade gate is reachable and shows on the record (proven via the master
 * dashboard's "Current stage" reading, which is open to anyone, rather than
 * via a gate Approver's own queue detail - there being no such Approver
 * seeded to open it), and that the Charge Number Admin still mints and
 * completes an authorization end to end when neither gate runs. The last of
 * these recovers the one piece of coverage no other e2e file exercises
 * (grep shows completion.spec.ts is the only e2e spec that ever touches
 * "mint" or "Charge number").
 */

async function initiateAuthorization(
  page: Page,
  options: {
    project: string;
    fundingType: "company-funded" | "commercial-contract";
    requestingLocationType: "domestic" | "international";
    performingLocationType: "domestic" | "international";
  },
): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();

  await page.getByLabel("Project").fill(options.project);

  const requesting = page.getByTestId("draft-requesting-department");
  await requesting.getByLabel("Search by name").fill("Rotor Assemblies");
  await requesting.getByRole("button", { name: "Rotor Assemblies", exact: true }).click();

  const performing = page.getByTestId("draft-performing-department");
  await performing.getByLabel("Search by name").fill("Flight Controls Software");
  await performing.getByRole("button", { name: "Flight Controls Software", exact: true }).click();

  await page.getByLabel("Funding type").selectOption(options.fundingType);
  await page.getByLabel("Requesting location type").selectOption(options.requestingLocationType);
  await page.getByLabel("Performing location type").selectOption(options.performingLocationType);
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

/** The four mandatory acknowledgements, common to all three scenarios below:
 *  requesting program manager, requesting finance, the performing
 *  department's claim and contribution, performing program manager,
 *  performing finance. */
async function walkTheFourMandatoryAcknowledgements(page: Page, project: string): Promise<void> {
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await acknowledgeAsCurrentParticipant(page, project);
  await acknowledgeAsCurrentParticipant(page, project);

  await page.getByLabel("Participant", { exact: true }).selectOption("p-jordan-hale");
  const contributorQueue = page.getByTestId("my-queue");
  const unclaimedRow = contributorQueue.getByTestId("queue-row").filter({ hasText: project });
  await unclaimedRow.getByRole("button", { name: "Open" }).click();
  const claimDetail = page.getByTestId("queue-item-detail");
  await claimDetail.getByTestId("claim").click();
  await claimDetail.getByLabel("Employee performing the work").fill("Priya Okonjo");
  await claimDetail.getByTestId("contribute").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  await page.getByLabel("Participant", { exact: true }).selectOption("p-marcus-oduya");
  await acknowledgeAsCurrentParticipant(page, project);
  await acknowledgeAsCurrentParticipant(page, project);
}

test("the Contracts gate is reached and recorded once the four mandatory acknowledgements are done", async ({
  page,
}) => {
  const project = `E2E Completion Contracts Gate ${Date.now()}`;
  await initiateAuthorization(page, {
    project,
    // A customer contract, so the Contracts gate runs; matching location
    // types keep Global Trade skipped, so this authorization comes to rest
    // at exactly one gate rather than the first of two.
    fundingType: "commercial-contract",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
  });

  await walkTheFourMandatoryAcknowledgements(page, project);

  // No Approver is seeded at "Contracts" in the 5-person demo roster (#92),
  // so nobody's queue will ever surface this - proof of reaching the gate
  // is read from the master dashboard instead, which is open to anyone
  // (BDR-0002) and reads current stage off the same log a queue would.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "All Authorizations" }).click();
  const dashboard = page.getByTestId("master-dashboard");
  await dashboard
    .getByTestId("dashboard-row")
    .filter({ hasText: project })
    .getByTestId("dashboard-view-history")
    .click();
  await expect(page.getByTestId("dashboard-history")).toContainText("Contracts (gate)");
});

test("the Global Trade gate is reached and recorded once the four mandatory acknowledgements are done", async ({
  page,
}) => {
  const project = `E2E Completion Global Trade Gate ${Date.now()}`;
  await initiateAuthorization(page, {
    project,
    // Company-funded skips Contracts; differing location types trigger
    // Global Trade, so this authorization comes to rest there instead.
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "international",
  });

  await walkTheFourMandatoryAcknowledgements(page, project);

  // Same reasoning as the Contracts case above: no seeded Global Trade
  // Approver to open a queue detail with, so the dashboard is the proof.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "All Authorizations" }).click();
  const dashboard = page.getByTestId("master-dashboard");
  await dashboard
    .getByTestId("dashboard-row")
    .filter({ hasText: project })
    .getByTestId("dashboard-view-history")
    .click();
  await expect(page.getByTestId("dashboard-history")).toContainText("Global Trade (gate)");
});

test("the Charge Number Admin mints and completes the authorization when neither gate runs", async ({ page }) => {
  const project = `E2E Completion No Gates ${Date.now()}`;
  await initiateAuthorization(page, {
    project,
    // Company-funded and matching location types skip both gates, so this
    // authorization reaches the mint stage - the one piece of #58's
    // behavior no other e2e file exercises (performing-claim.spec.ts stops
    // short of it).
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
  });

  await walkTheFourMandatoryAcknowledgements(page, project);

  // The Charge Number Admin mints the charge number - the mint stage is
  // reached only now, after every earlier stage has resolved and both gates
  // have skipped.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-elin-vasquez");
  const mintRow = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await expect(mintRow).toBeVisible();
  await mintRow.getByRole("button", { name: "Open" }).click();
  const mintDetail = page.getByTestId("queue-item-detail");
  await expect(mintDetail.getByTestId("queue-item-stage")).toContainText("charge number");
  await mintDetail.getByLabel("Charge number").fill("CN-77102");
  await mintDetail.getByTestId("mint").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Minting resolves the mint stage - the authorization leaves the Charge
  // Number Admin's queue, and the whole relay is now in nobody's queue.
  await expect(
    page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project }),
  ).toHaveCount(0);

  // Completed, readable from the master dashboard like anything else. The
  // dashboard loads once per identity and does not poll (`MasterDashboard.tsx`
  // has no poll), so switching identity forces the fresh read that picks up
  // the mint just performed.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "All Authorizations" }).click();
  const dashboard = page.getByTestId("master-dashboard");
  await expect(
    dashboard.getByTestId("dashboard-row").filter({ hasText: project }).getByTestId("dashboard-row-stage"),
  ).toContainText("Completed");
});
