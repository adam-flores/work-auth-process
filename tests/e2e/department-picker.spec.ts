import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * The department picker (#50, BDR-0008): what the service seam cannot
 * express - narrowing, searching, and resolving to a department through the
 * rendered surface, with the derived division and legal entity shown rather
 * than asked for. Exercised twice per page, since one component serves both
 * the requesting and the performing side.
 */

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
  await page.goto("/");
  const requesting = picker(page, "requesting-department");

  await requesting.search.fill("Rotor Hubs");
  await expect(requesting.result("Rotor Hubs")).toBeVisible();
  await expect(requesting.result("Rotor Hubs - Pacific")).toBeVisible();
  await expect(requesting.result("Rotor Hubs - U.K.")).toBeVisible();
  await expect.poll(() => resultCount(requesting.resultItems)).toBe(3);

  await requesting.result("Rotor Hubs").click();

  await expect(requesting.selected).toBeVisible();
  await expect(requesting.selected).toContainText("Rotor Hubs");
  await expect(requesting.selected).toContainText("Rotor Assemblies");
  await expect(requesting.selected).toContainText("Calderis Structures Group");

  // Nothing pre-filled, and the field lookup is gone - what remains is a
  // read-back of what the hierarchy derived.
  await expect(requesting.search).toHaveCount(0);
});

test("attribute filters narrow, combine with search text, and inactive departments never appear", async ({
  page,
}) => {
  await page.goto("/");
  const performing = picker(page, "performing-department");

  await expect.poll(() => resultCount(performing.resultItems)).toBeGreaterThan(0);
  const unfiltered = await resultCount(performing.resultItems);

  await performing.filter("foreign").check();
  await expect.poll(() => resultCount(performing.resultItems)).toBeLessThan(unfiltered);
  const foreignOnly = await resultCount(performing.resultItems);
  expect(foreignOnly).toBeGreaterThan(0);

  // Filters are combinable, not cascading radio buttons: a second one narrows
  // further rather than replacing the first.
  await performing.search.fill("Rotor");
  await expect.poll(() => resultCount(performing.resultItems)).toBeLessThanOrEqual(foreignOnly);

  await performing.filter("foreign").uncheck();
  await performing.search.fill("Crosstrade");
  // Seeded inactive (BDR-0010, its jurisdiction is undeterminable) - findable
  // by exact name everywhere except the picker, which is the one place a new
  // authorization could be raised against it.
  await expect(performing.resultsList).toContainText("No matching departments.");
  expect(await resultCount(performing.resultItems)).toBe(0);
});

test("the two pickers act independently, and there is no free-text entry for the department itself", async ({
  page,
}) => {
  await page.goto("/");
  const requesting = picker(page, "requesting-department");
  const performing = picker(page, "performing-department");

  await requesting.search.fill("Rotor Hubs");
  await requesting.result("Rotor Hubs").click();
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
