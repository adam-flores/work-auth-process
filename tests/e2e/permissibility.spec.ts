import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Permissibility at entry, end to end (#53, BDR-0007): a foreign department
 * may not perform work for a domestic one, refused the moment both
 * departments are set on a draft rather than days later at a gate. The
 * e2e store is shared across this whole file (playwright.config.ts runs one
 * worker), same discipline as drafts.spec.ts.
 */

async function newDraft(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund");
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("draft-form")).toBeVisible();
}

async function pickDepartment(page: Page, testId: string, name: string): Promise<void> {
  const picker = page.getByTestId(testId);
  await picker.getByLabel("Search by name").fill(name);
  await picker.getByRole("button", { name, exact: true }).click();
  await expect(picker.getByTestId(`${testId}-selected`)).toContainText(name);
}

test("a refused pairing: a foreign department may not perform work for a domestic one", async ({ page }) => {
  await newDraft(page);

  await pickDepartment(page, "draft-requesting-department", "Thermal Coatings");
  await pickDepartment(page, "draft-performing-department", "Rotor Hubs - Pacific");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("not a permitted pairing");
});

test("a permitted pairing: a domestic department performing for a foreign one saves cleanly", async ({
  page,
}) => {
  await newDraft(page);

  // The reverse of the refused pairing above - direction matters to the rule.
  await pickDepartment(page, "draft-requesting-department", "Rotor Hubs - Pacific");
  await pickDepartment(page, "draft-performing-department", "Thermal Coatings");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("only an Administrator sees the surface to add or remove a pairing", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund"); // a Contributor

  const rules = page.getByTestId("permissibility-rules");
  await expect(rules.getByTestId("permissibility-rule-row")).toContainText(
    "A foreign department may not perform work for a domestic one.",
  );
  await expect(rules.getByTestId("add-permissibility-rule")).toHaveCount(0);
  await expect(rules).toContainText("Act as an Administrator to add or remove a pairing.");
});

test("an Administrator adds a pairing, it refuses immediately, and removing it restores permission", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-erez-caldwell"); // the Administrator

  const rules = page.getByTestId("permissibility-rules");
  await expect(rules.getByTestId("permissibility-rule-row")).toContainText(
    "A foreign department may not perform work for a domestic one.",
  );

  // Add the reverse pairing - domestic may not perform for foreign - which
  // the seeded list does not already refuse.
  await rules.getByLabel("Requesting side's jurisdiction").selectOption("foreign");
  await rules.getByLabel("Performing side's jurisdiction").selectOption("domestic");
  await rules.getByTestId("add-permissibility-rule").click();
  await expect(rules.getByTestId("permissibility-rule-row")).toHaveCount(2);

  await page.getByTestId("new-draft").click();
  await pickDepartment(page, "draft-requesting-department", "Rotor Hubs - Pacific");
  await pickDepartment(page, "draft-performing-department", "Thermal Coatings");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("not a permitted pairing");

  await page.getByRole("button", { name: "Close" }).click();

  const addedRow = rules
    .getByTestId("permissibility-rule-row")
    .filter({ hasText: "A domestic department may not perform work for a foreign one." });
  await addedRow.getByRole("button", { name: "Remove" }).click();
  await expect(rules.getByTestId("permissibility-rule-row")).toHaveCount(1);
});
