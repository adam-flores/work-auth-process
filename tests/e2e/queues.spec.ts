import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Queues, and the first acknowledgement (#55), end to end: a submitter
 * initiates a complete draft, it arrives in the requesting department's
 * Approver queue, and acknowledging it advances the record to the next
 * stage - still visible to the same department, since the first two stages
 * both route to the requesting side, but awaiting a different stage's
 * criteria now. The e2e store is shared across this whole file
 * (playwright.config.ts runs one worker), same discipline as drafts.spec.ts.
 */

async function initiateCompleteAuthorization(page: Page, project: string): Promise<void> {
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

test("a queue renders what has arrived, and acknowledging it advances the record", async ({ page }) => {
  // Distinctive and rerun-safe: an authorization this test leaves pending
  // stays in the seeded department's queue forever (there is no delete for
  // one, unlike a draft), so a fixed name would collide with a leftover
  // from an earlier run against the same e2e store.
  const project = `E2E Queue Walkthrough ${Date.now()}`;
  await initiateCompleteAuthorization(page, project);

  // An Approver at the requesting department - the stage's queue, not a
  // named person (BDR-0013).
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");

  const queue = page.getByTestId("my-queue");
  const row = queue.getByTestId("queue-row").filter({ hasText: project });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Open" }).click();
  const detail = page.getByTestId("queue-item-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("queue-item-stage")).toContainText("scope");
  await expect(detail).toContainText("Heat Exchange Products");
  await expect(detail).toContainText("Rotor Hubs");

  await detail.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Still in the same Approver's queue - requesting-finance routes to the
  // same department requesting-program-manager did - but awaiting a
  // different stage's criteria, which is the advance made visible.
  const reopened = queue.getByTestId("queue-row").filter({ hasText: project });
  await expect(reopened).toBeVisible();
  await reopened.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("queue-item-detail").getByTestId("queue-item-stage")).toContainText(
    "funds available",
  );
});

test("a stage routes to every holder of the role at the department, not to a named person", async ({ page }) => {
  const project = `E2E Shared Queue ${Date.now()}`;
  await initiateCompleteAuthorization(page, project);

  // Two different Approvers at Heat Exchange Products both see it.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await expect(
    page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project }),
  ).toBeVisible();

  await page.getByLabel("Participant", { exact: true }).selectOption("p-hugo-strand");
  await expect(
    page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project }),
  ).toBeVisible();

  // An Approver at a different department does not.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-mira-devane");
  await expect(
    page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project }),
  ).toHaveCount(0);

  // A Contributor holds no queue at all.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await expect(page.getByTestId("my-queue")).toContainText("Nothing is waiting on you.");
});
