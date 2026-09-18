import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The HTTP route and web UI affordance for `hold`, `release`, `withdraw`
 * and `refer` (#83) - the four commands #61 and #62 already built at the
 * service layer, with no route or control until now. This is adapter and
 * UI coverage only (#83's own acceptance criteria): the service behavior
 * itself - who may act, what is refused, what the transition log records -
 * is already covered under tests/service/.
 */

async function initiateAuthorization(
  page: Page,
  options: {
    submitter: string;
    project: string;
    requestingDepartment: string;
    performingDepartment: string;
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
  await page.getByLabel("Performing finance approver").fill("Priya Nandan");

  await page.getByLabel("Budget hours").fill("40");
  await page.getByLabel("Labor rate").fill("85.5");
  await page.getByRole("button", { name: "Add resource" }).click();

  await page.getByTestId("initiate-draft").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("draft-form")).toHaveCount(0);
}

test("a submitter can hold, release, and withdraw their own authorization from the master dashboard", async ({
  page,
}) => {
  const project = `Hold Release Withdraw ${Date.now()}`;

  await initiateAuthorization(page, {
    submitter: "p-avery-lund",
    project,
    requestingDepartment: "Heat Exchange Products",
    performingDepartment: "Rotor Hubs",
  });

  // The master dashboard loads once, on mount or on switching who is acting
  // (`MasterDashboard.tsx` has no poll) - switching away and back to the
  // same participant forces a fresh read that now includes what was just
  // initiated.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-erez-caldwell");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");

  // The submitter's own view of it: the master dashboard, open to anyone,
  // with hold/release/withdraw appearing only because this is the same
  // participant who raised it (there is no dedicated "my authorizations"
  // view yet - `MyDrafts.tsx` is drafts only).
  const dashboard = page.getByTestId("master-dashboard");
  await dashboard
    .getByTestId("dashboard-row")
    .filter({ hasText: project })
    .getByTestId("dashboard-view-history")
    .click();

  const controls = page.getByTestId("submitter-controls");
  await expect(controls).toBeVisible();
  await expect(controls.getByTestId("hold")).toBeVisible();
  await expect(controls.getByTestId("release")).toHaveCount(0);

  await controls.getByTestId("hold").click();
  await expect(page.getByTestId("dashboard-on-hold")).toBeVisible();
  await expect(controls.getByTestId("release")).toBeVisible();
  await expect(controls.getByTestId("hold")).toHaveCount(0);

  // Held is in nobody's queue (#61) - the Approver who would otherwise see
  // this at the first stage does not, while it is held. Switching actor
  // reloads the dashboard from scratch (`MasterDashboard.tsx` has no poll)
  // and closes whatever was open, so the detail view is reopened afterward.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await expect(page.getByTestId("my-queue").getByTestId("queue-row").filter({ hasText: project })).toHaveCount(0);
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await dashboard
    .getByTestId("dashboard-row")
    .filter({ hasText: project })
    .getByTestId("dashboard-view-history")
    .click();

  await controls.getByTestId("release").click();
  await expect(page.getByTestId("dashboard-on-hold")).toHaveCount(0);
  await expect(controls.getByTestId("hold")).toBeVisible();

  await controls.getByTestId("withdraw").click();
  await expect(page.getByTestId("dashboard-history")).toContainText("Withdrawn");
  // Terminal: no further hold, release or withdraw to offer.
  await expect(page.getByTestId("submitter-controls")).toHaveCount(0);
});

test("whoever holds an authorization at its stage can refer it to a colleague", async ({ page }) => {
  const project = `Referral ${Date.now()}`;

  await initiateAuthorization(page, {
    submitter: "p-rosa-imbert",
    project,
    requestingDepartment: "Heat Exchange Products",
    performingDepartment: "Rotor Hubs",
  });

  // The first stage's queue: an Approver at the requesting department.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await page
    .getByTestId("my-queue")
    .getByTestId("queue-row")
    .filter({ hasText: project })
    .getByRole("button", { name: "Open" })
    .click();

  await page.getByTestId("open-refer").click();
  await page.getByTestId("refer-colleague").selectOption({ label: "Hugo Strand" });
  await page.getByTestId("submit-refer").click();

  // A referral resolves nothing and moves nothing - the stage's own action
  // is still there, waiting, exactly as it was.
  await expect(page.getByTestId("refer-form")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("acknowledge")).toBeVisible();

  await page.getByTestId("acknowledge").click();
  await expect(page.getByTestId("queue-item-detail")).toHaveCount(0);

  // Recorded on the authorization's history, readable from the master
  // dashboard - never counted anywhere else (BDR-0011).
  await page.getByLabel("Participant", { exact: true }).selectOption("p-erez-caldwell");
  const dashboard = page.getByTestId("master-dashboard");
  await dashboard
    .getByTestId("dashboard-row")
    .filter({ hasText: project })
    .getByTestId("dashboard-view-history")
    .click();
  await expect(page.getByTestId("dashboard-referrals")).toContainText("Cate Marchetti showed this to Hugo Strand");
});
