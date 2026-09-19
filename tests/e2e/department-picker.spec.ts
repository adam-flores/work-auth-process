import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * The department picker (#50, BDR-0008): what the service seam cannot
 * express - narrowing, searching, and resolving to a department through the
 * rendered surface, with the derived division and legal entity shown rather
 * than asked for. Exercised twice per page, since one component serves both
 * the requesting and the performing side.
 *
 * Reached through a draft (#51), the surface it was always headed for: a new
 * draft is created and opened before each test, and the two pickers under
 * test are the ones embedded in that draft's form.
 */

async function openNewDraft(page: Page): Promise<void> {
  await page.goto("/");
  // `system` cannot submit a draft (it owns no work); a draft needs a real
  // accountable submitter, so acting as one is the first step every time.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-jordan-hale");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();
}

function picker(page: Page, testId: string) {
  const root = page.getByTestId(testId);
  // The <ul> itself - one element, so text assertions against it don't hit
  // Playwright's strict mode the way asserting against every <li> at once would.
  const resultsList = root.getByTestId(`${testId}-results`);
  return {
    root,
    search: root.getByLabel("Search by name"),
    resultsList,
    resultItems: resultsList.locator("li"),
    result: (name: string) => resultsList.getByRole("button", { name, exact: true }),
    selected: root.getByTestId(`${testId}-selected`),
    change: root.getByTestId(`${testId}-change`),
    filter: (value: string) => root.getByRole("checkbox", { name: value, exact: true }),
  };
}

async function resultCount(items: Locator): Promise<number> {
  // The empty state renders one placeholder <li>, not zero results.
  const texts = await items.allTextContents();
  if (texts.length === 1 && texts[0] === "No matching departments.") return 0;
  return texts.length;
}

test("searching narrows to name matches, and selecting shows the derived division and legal entity", async ({
  page,
}) => {
  // The demo catalog (#92) is small and freshly authored rather than
  // trimmed from the old 58-department chart, so it has no near-identical
  // sibling names ("Rotor Hubs" / "Rotor Hubs - Pacific" / "Rotor Hubs -
  // U.K.") left to disambiguate by search - that exact scenario is still
  // covered at the unit level against the original fixture
  // (tests/service/*, per #92's own note). What this proves instead: a
  // partial, case-sensitive-in-name-only substring still narrows the
  // unfiltered list down to the one department it matches, and selecting
  // it reads back the division and legal entity the hierarchy derived
  // rather than anything typed.
  await openNewDraft(page);
  const requesting = picker(page, "draft-requesting-department");

  await expect.poll(() => resultCount(requesting.resultItems)).toBeGreaterThan(1);

  await requesting.search.fill("Rotor");
  await expect(requesting.result("Rotor Assemblies")).toBeVisible();
  await expect.poll(() => resultCount(requesting.resultItems)).toBe(1);

  await requesting.result("Rotor Assemblies").click();

  await expect(requesting.selected).toBeVisible();
  await expect(requesting.selected).toContainText("Rotor Assemblies");
  await expect(requesting.selected).toContainText("Structures");
  await expect(requesting.selected).toContainText("Calderis Aerospace");

  // Nothing pre-filled, and the field lookup is gone - what remains is a
  // read-back of what the hierarchy derived.
  await expect(requesting.search).toHaveCount(0);
});

test("attribute filters narrow, combine with search text, and a department closed by the Administrator never appears", async ({
  page,
}) => {
  await openNewDraft(page);
  const performing = picker(page, "draft-performing-department");

  await expect.poll(() => resultCount(performing.resultItems)).toBeGreaterThan(0);
  const unfiltered = await resultCount(performing.resultItems);

  await performing.filter("foreign").check();
  await expect.poll(() => resultCount(performing.resultItems)).toBeLessThan(unfiltered);
  const foreignOnly = await resultCount(performing.resultItems);
  expect(foreignOnly).toBeGreaterThan(0);

  // Filters are combinable, not cascading radio buttons: a second one narrows
  // further rather than replacing the first.
  await performing.search.fill("Heat");
  await expect.poll(() => resultCount(performing.resultItems)).toBeLessThanOrEqual(foreignOnly);

  await performing.filter("foreign").uncheck();
  await performing.search.fill("");

  // Unlike the old 58-department fixture, the demo catalog (#92) seeds
  // nothing inactive - every department has a determinable jurisdiction, so
  // there is no "Crosstrade" to find by exact name here. Instead, produce
  // that state the way a real Administrator would: add a department and
  // close it (the same add-then-set-inactive flow hierarchy-admin.spec.ts
  // exercises), then prove the picker excludes it by exact name even though
  // it still exists in the hierarchy.
  await page.getByLabel("Participant", { exact: true }).selectOption("p-teo-brandt");
  await page.getByRole("tab", { name: "Reference Data" }).click();
  const admin = page.getByTestId("hierarchy-admin");
  const departmentName = `E2E Closed Department ${Date.now()}`;
  const form = admin.getByTestId("hierarchy-add-form");
  await form.getByLabel("Level").selectOption("department");
  await form.getByLabel("Division").selectOption({ label: "Structures" });
  await form.getByLabel("Name").fill(departmentName);
  await form.getByTestId("add-hierarchy-node").click();
  await expect(admin.getByText(departmentName, { exact: true })).toBeVisible();

  const departmentRow = admin.getByTestId("hierarchy-department-row").filter({ hasText: departmentName });
  await departmentRow.getByTestId("hierarchy-set-inactive").click();
  await expect(departmentRow).toContainText("(inactive)");

  await page.getByLabel("Participant", { exact: true }).selectOption("p-jordan-hale");
  await page.getByRole("tab", { name: "Submit" }).click();
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();
  const freshPerforming = picker(page, "draft-performing-department");
  await freshPerforming.search.fill(departmentName);
  await expect(freshPerforming.resultsList).toContainText("No matching departments.");
  expect(await resultCount(freshPerforming.resultItems)).toBe(0);
});

test("the two pickers act independently, and there is no free-text entry for the department itself", async ({
  page,
}) => {
  await openNewDraft(page);
  const requesting = picker(page, "draft-requesting-department");
  const performing = picker(page, "draft-performing-department");

  await requesting.search.fill("Rotor Assemblies");
  await requesting.result("Rotor Assemblies").click();
  await expect(requesting.selected).toBeVisible();

  // Selecting one side leaves the other untouched.
  await expect(performing.selected).toHaveCount(0);
  await expect(performing.search).toBeVisible();

  // Typing text - including a name nothing in the hierarchy holds - never by
  // itself produces a selection. The only route is clicking a returned result.
  await performing.search.fill("Nothing In The Hierarchy Is Named This");
  await expect(performing.resultsList).toContainText("No matching departments.");
  expect(await resultCount(performing.resultItems)).toBe(0);
  await expect(performing.selected).toHaveCount(0);

  await requesting.change.click();
  await expect(requesting.selected).toHaveCount(0);
  await expect(requesting.search).toBeVisible();
  await expect(requesting.search).toHaveValue("");
});
