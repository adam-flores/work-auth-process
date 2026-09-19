import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The master dashboard (#63, BDR-0002): every authorization in the system,
 * open to anyone with access, filterable by submitter, stage, participant
 * and identifier - plus the notification a role gets the moment something
 * arrives in their queue (CONTEXT.md: "Notification"). The e2e store is
 * shared across this whole file (playwright.config.ts runs one worker),
 * same discipline as queues.spec.ts.
 */

async function initiateAuthorization(
  page: Page,
  options: {
    submitter: string;
    project: string;
    requestingDepartment: string;
    performingDepartment: string;
    performingFinanceApprover?: string;
  },
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
  await page.getByLabel("Performing finance approver").fill(options.performingFinanceApprover ?? "Priya Nandan");

  await page.getByLabel("Budget hours").fill("40");
  await page.getByLabel("Labor rate").fill("85.5");
  await page.getByRole("button", { name: "Add resource" }).click();

  await page.getByTestId("initiate-draft").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("draft-form")).toHaveCount(0);
}

test("the master dashboard shows every authorization and draft, filterable by submitter, stage, participant and identifier", async ({
  page,
}) => {
  const ts = Date.now();
  const projectAlpha = `Dashboard Alpha ${ts}`;
  const projectBeta = `Dashboard Beta ${ts}`;
  const projectDraft = `Dashboard Draft ${ts}`;
  const distinctiveApprover = `Uniquely Named Approver ${ts}`;

  await initiateAuthorization(page, {
    submitter: "p-priya-anand",
    project: projectAlpha,
    requestingDepartment: "Landing Gear Systems",
    performingDepartment: "Flight Controls Software",
    performingFinanceApprover: distinctiveApprover,
  });

  await initiateAuthorization(page, {
    submitter: "p-jordan-hale",
    project: projectBeta,
    requestingDepartment: "Flight Controls Software",
    performingDepartment: "Landing Gear Systems",
  });

  // Advances Beta to "requesting-finance" so it sits at a different stage
  // from Alpha, which is what makes the stage filter's assertion mean
  // something rather than passing by coincidence.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-marcus-oduya");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await page
    .getByTestId("my-queue")
    .getByTestId("queue-row")
    .filter({ hasText: projectBeta })
    .getByRole("button", { name: "Open" })
    .click();
  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // A draft, left unsubmitted - visible on the dashboard like anything else
  // (BDR-0003).
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  await page.getByRole("tab", { name: "Submit" }).click();
  await page.getByTestId("new-draft").click();
  await page.getByLabel("Project").fill(projectDraft);
  await page.getByTestId("draft-form").getByRole("button", { name: "Save" }).click();
  await page.getByTestId("draft-form").getByRole("button", { name: "Close" }).click();

  // Viewed as an unrelated Administrator - the master dashboard is open to
  // anyone with access, not only a party to the record (BDR-0002).
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "All Authorizations" }).click();
  const dashboard = page.getByTestId("master-dashboard");
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectAlpha })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectBeta })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectDraft })).toBeVisible();

  // Filter by identifier: Alpha's own id, read back from its row, narrows
  // to Alpha alone.
  const alphaRow = dashboard.getByTestId("dashboard-row").filter({ hasText: projectAlpha });
  const alphaId = (await alphaRow.getByTestId("dashboard-row-identifier").textContent())!.trim();
  await dashboard.getByTestId("dashboard-filter-identifier").fill(alphaId);
  await expect(dashboard.getByTestId("dashboard-row")).toHaveCount(1);
  await expect(dashboard.getByTestId("dashboard-row")).toContainText(projectAlpha);
  await dashboard.getByTestId("dashboard-filter-identifier").fill("");

  // Filter by stage: Alpha and Beta now sit at different stages.
  await dashboard.getByTestId("dashboard-filter-stage").selectOption("requesting-program-manager");
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectAlpha })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectBeta })).toHaveCount(0);
  await dashboard.getByTestId("dashboard-filter-stage").selectOption("requesting-finance");
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectBeta })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectAlpha })).toHaveCount(0);
  // Not asserted down to a total row count here: other e2e specs sharing
  // this store leave their own drafts behind, so "every draft" is a bigger
  // set than just this test's own - the identifier filter above already
  // proved narrowing works precisely.
  await dashboard.getByTestId("dashboard-filter-stage").selectOption("draft");
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectDraft })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectAlpha })).toHaveCount(0);
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectBeta })).toHaveCount(0);
  await dashboard.getByTestId("dashboard-filter-stage").selectOption("");

  // Filter by submitter: Alpha and the draft share a submitter Beta does not.
  await dashboard.getByTestId("dashboard-filter-submitter").fill("Priya Anand");
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectAlpha })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectDraft })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectBeta })).toHaveCount(0);
  await dashboard.getByTestId("dashboard-filter-submitter").fill("");

  // Filter by participant: the distinctively named finance approver on
  // Alpha alone.
  await dashboard.getByTestId("dashboard-filter-participant").fill(distinctiveApprover);
  await expect(dashboard.getByTestId("dashboard-row")).toHaveCount(1);
  await expect(dashboard.getByTestId("dashboard-row")).toContainText(projectAlpha);

  // The full transition history is readable here - since the queue keeps
  // none.
  await dashboard.getByTestId("dashboard-view-history").click();
  const history = page.getByTestId("dashboard-history");
  await expect(history).toBeVisible();
  await expect(history.getByTestId("dashboard-stage-history")).toContainText("Requesting program manager");
});

test("the participant filter matches a draft's own named fields, not only its submitter", async ({ page }) => {
  const projectDraft = `Dashboard Draft Participant ${Date.now()}`;
  const distinctiveManager = `Uniquely Named Manager ${Date.now()}`;

  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-jordan-hale");
  await page.getByTestId("new-draft").click();
  await page.getByLabel("Project").fill(projectDraft);
  await page.getByLabel("Performing program manager").fill(distinctiveManager);
  await page.getByTestId("draft-form").getByRole("button", { name: "Save" }).click();
  await page.getByTestId("draft-form").getByRole("button", { name: "Close" }).click();

  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "All Authorizations" }).click();
  const dashboard = page.getByTestId("master-dashboard");
  await dashboard.getByTestId("dashboard-filter-participant").fill(distinctiveManager);
  await expect(dashboard.getByTestId("dashboard-row").filter({ hasText: projectDraft })).toBeVisible();
});

test("a notification fires when an authorization arrives in a role's queue", async ({ page, context }) => {
  const project = `Arrival Notification ${Date.now()}`;

  // An Approver at the requesting department, already looking at their
  // queue when the authorization arrives.
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-priya-anand");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await expect(page.getByTestId("my-queue")).toBeVisible();
  await expect(page.getByTestId("notification-list")).toHaveCount(0);

  // A different browser tab against the same server: the submitter
  // initiates a fresh authorization while the approver's queue is already
  // open and polling.
  const submitterPage = await context.newPage();
  await initiateAuthorization(submitterPage, {
    submitter: "p-teo-brandt",
    project,
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Landing Gear Systems",
  });
  await submitterPage.close();

  const notification = page.getByTestId("arrival-notification").filter({ hasText: project });
  await expect(notification).toBeVisible({ timeout: 10_000 });

  await notification.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("arrival-notification").filter({ hasText: project })).toHaveCount(0);
});
