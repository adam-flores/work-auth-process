import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Charge number, completion, and the classification freeze (#58): the whole
 * happy path, walked end to end in the running app - draft, initiate, the
 * four mandatory acknowledgements, both gates actually running (not
 * skipped, unlike tests/e2e/performing-claim.spec.ts's company-funded,
 * same-country case), and the Charge Number Admin minting the charge
 * number that completes the authorization. The e2e store is shared across
 * this whole file (playwright.config.ts runs one worker), same discipline
 * as queues.spec.ts and performing-claim.spec.ts.
 */

async function initiateCrossBorderContractAuthorization(page: Page, project: string): Promise<void> {
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

  // A customer contract and differing location types, so both gates run
  // rather than skip - the negative case is already covered end to end by
  // performing-claim.spec.ts.
  await page.getByLabel("Funding type").selectOption("commercial-contract");
  await page.getByLabel("Requesting location type").selectOption("domestic");
  await page.getByLabel("Performing location type").selectOption("international");
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

test("draft, initiate, the four acknowledgements, both gates, and the charge number are walkable end to end", async ({
  page,
}) => {
  // Distinctive and rerun-safe, same reasoning as queues.spec.ts: an
  // authorization this test leaves pending stays in a queue forever.
  const project = `E2E Completion ${Date.now()}`;
  await initiateCrossBorderContractAuthorization(page, project);

  // Requesting program manager, then requesting finance.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await acknowledgeAsCurrentParticipant(page, project);
  await acknowledgeAsCurrentParticipant(page, project);

  // The performing department claims and contributes.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-nils-oyelaran");
  const contributorQueue = page.getByTestId("my-queue");
  const unclaimedRow = contributorQueue.getByTestId("queue-row").filter({ hasText: project });
  await unclaimedRow.getByRole("button", { name: "Open" }).click();
  const claimDetail = page.getByTestId("queue-item-detail");
  await claimDetail.getByTestId("claim").click();
  await claimDetail.getByLabel("Employee performing the work").fill("Priya Okonjo");
  await claimDetail.getByTestId("contribute").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Performing program manager, then performing finance.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-mira-devane");
  await acknowledgeAsCurrentParticipant(page, project);
  await acknowledgeAsCurrentParticipant(page, project);

  // Contracts runs - the funding type is a customer contract.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-farah-quintela");
  const contractsRow = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await expect(contractsRow).toBeVisible();
  await contractsRow.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("queue-item-stage")).toContainText("contract terms");
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Global Trade runs - the two sides' declared location types differ.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-oskar-lindqvist");
  const globalTradeRow = page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project });
  await expect(globalTradeRow).toBeVisible();
  await globalTradeRow.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("queue-item-stage")).toContainText("export");
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // The Charge Number Admin mints the charge number - the mint stage is
  // reached only now, after every earlier stage has resolved.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-sadie-okonkwo");
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
});
