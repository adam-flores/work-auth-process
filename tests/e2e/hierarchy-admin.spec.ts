import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The Administrator maintaining the hierarchy, end to end (#64, BDR-0010):
 * add a legal entity, a division under it and a department under that,
 * rename the department, then set it inactive and watch the fan-out - the
 * in-flight authorization naming it is revoked, and the submitter's page
 * (never switched away from their own identity, the way a real notification
 * would find them) shows the notice. The e2e store is shared across this
 * whole file (playwright.config.ts runs one worker), same discipline as
 * master-dashboard.spec.ts.
 */

const ADMINISTRATOR = "p-erez-caldwell";
const SUBMITTER = "p-avery-lund";

async function actAs(page: Page, participantId: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption(participantId);
}

async function addHierarchyNode(
  page: Page,
  level: "legal-entity" | "division" | "department",
  name: string,
  parentLabel?: string,
  parentName?: string,
): Promise<void> {
  const admin = page.getByTestId("hierarchy-admin");
  const form = admin.getByTestId("hierarchy-add-form");
  await form.getByLabel("Level").selectOption(level);
  if (parentLabel && parentName) {
    await form.getByLabel(parentLabel).selectOption({ label: parentName });
  }
  await form.getByLabel("Name").fill(name);
  await form.getByTestId("add-hierarchy-node").click();
  await expect(admin.getByText(name, { exact: true })).toBeVisible();
}

test("add, rename, and set-inactive with its revocation fan-out", async ({ page, context }) => {
  const adminPage = await context.newPage();
  await actAs(adminPage, ADMINISTRATOR);
  await adminPage.getByRole("tab", { name: "Reference Data" }).click();

  const legalEntityName = `E2E Legal Entity ${Date.now()}`;
  const divisionName = `E2E Division ${Date.now()}`;
  const departmentName = `E2E Department ${Date.now()}`;

  await addHierarchyNode(adminPage, "legal-entity", legalEntityName);
  await addHierarchyNode(adminPage, "division", divisionName, "Legal entity", legalEntityName);
  await addHierarchyNode(adminPage, "department", departmentName, "Division", divisionName);

  // Rename does not need a fresh reload to show up.
  const admin = adminPage.getByTestId("hierarchy-admin");
  const departmentRow = admin.getByTestId("hierarchy-department-row").filter({ hasText: departmentName });
  await departmentRow.getByTestId("hierarchy-rename").click();
  const renamedDepartmentName = `${departmentName} Renamed`;
  await departmentRow.getByTestId("hierarchy-rename-input").fill(renamedDepartmentName);
  await departmentRow.getByTestId("hierarchy-rename-save").click();
  await expect(admin.getByText(renamedDepartmentName, { exact: true })).toBeVisible();

  // The change log records all three edits so far.
  const changeLog = adminPage.getByTestId("hierarchy-change-log");
  await expect(changeLog.getByTestId("hierarchy-change-row")).toContainText([
    new RegExp(`Added legal entity "${legalEntityName}"`),
    new RegExp(`Added division "${divisionName}"`),
    new RegExp(`Added department "${departmentName}"`),
    new RegExp(`Renamed department "${departmentName}" to "${renamedDepartmentName}"`),
  ]);

  // The submitter's own page - never switched to another identity, the way
  // a real person watching their own queue never would be - establishes its
  // notification baseline before anything is revoked.
  await actAs(page, SUBMITTER);
  const projectName = `Revoked by a hierarchy change ${Date.now()}`;
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();
  await page.getByLabel("Project").fill(projectName);

  const requesting = page.getByTestId("draft-requesting-department");
  await requesting.getByLabel("Search by name").fill("Heat Exchange Products");
  await requesting.getByRole("button", { name: "Heat Exchange Products", exact: true }).click();

  const performing = page.getByTestId("draft-performing-department");
  await performing.getByLabel("Search by name").fill(renamedDepartmentName);
  await performing.getByRole("button", { name: renamedDepartmentName, exact: true }).click();

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

  // Nothing revoked yet.
  await expect(page.getByTestId("revocation-notice")).toHaveCount(0);

  // The Administrator, on their own page, closes the department.
  await departmentRow.getByTestId("hierarchy-set-inactive").click();
  await expect(departmentRow).toContainText("(inactive)");
  await expect(changeLog.getByTestId("hierarchy-change-row")).toContainText([
    new RegExp(`Added legal entity "${legalEntityName}"`),
    new RegExp(`Added division "${divisionName}"`),
    new RegExp(`Added department "${departmentName}"`),
    new RegExp(`Renamed department "${departmentName}" to "${renamedDepartmentName}"`),
    new RegExp(`Closed department "${renamedDepartmentName}"`),
  ]);

  // The submitter's page, still on the same identity the whole time, picks
  // it up on its next poll.
  await expect(page.getByTestId("revocation-notice")).toContainText("was revoked", { timeout: 8000 });

  // The master dashboard loads once per identity and does not poll like a
  // queue does, so a fresh look needs a reload - the same way a person
  // would go and look, rather than have it pushed to them (CONTEXT.md:
  // "the master dashboard is what they go and look at").
  await page.reload();
  await page.getByLabel("Participant", { exact: true }).selectOption(SUBMITTER);
  await page.getByRole("tab", { name: "All Authorizations" }).click();

  // The master dashboard reads the revocation back too, with the system's
  // own comment - open on the submitter's page like anything else.
  const dashboard = page.getByTestId("master-dashboard");
  await dashboard
    .getByTestId("dashboard-row")
    .filter({ hasText: projectName })
    .getByTestId("dashboard-view-history")
    .click();
  await expect(page.getByTestId("dashboard-revocation")).toContainText("closed by a hierarchy change");
});

test("only an Administrator sees the surface to add, rename or set a node inactive", async ({ page }) => {
  await actAs(page, SUBMITTER);
  await page.getByRole("tab", { name: "Reference Data" }).click();
  const admin = page.getByTestId("hierarchy-admin");
  await expect(admin.getByTestId("hierarchy-add-form")).toHaveCount(0);
  await expect(admin.getByTestId("hierarchy-rename")).toHaveCount(0);
  await expect(admin.getByTestId("hierarchy-set-inactive")).toHaveCount(0);
  await expect(admin).toContainText("Act as an Administrator to add, rename or close part of the hierarchy.");
});
