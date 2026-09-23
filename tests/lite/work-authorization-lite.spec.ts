import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Prototype-lite end to end (#99), driven the way an operator drives it:
 * straight from disk, one browser, switching roles. Assertions are on what a
 * person sees. The routing rules come first because they are the controls,
 * and a gate that silently fails to fire is the one bug a demo never shows.
 */

const FILE = new URL("../../prototypes/work-authorization-lite.html", import.meta.url).href;

type Side = "requesting" | "performing";

interface Raise {
  project: string;
  funding: string;
  requesting: { dept: string; locationType: "Domestic" | "International" };
  performing: { dept: string; locationType: "Domestic" | "International" };
}

async function open(page: Page): Promise<void> {
  await page.goto(FILE);
  await expect(page.getByRole("heading", { name: "Authorizations" })).toBeVisible();
}

async function actAs(page: Page, role: string): Promise<void> {
  await page.getByLabel("Acting as").selectOption({ label: role });
}

async function openAuthorization(page: Page, id: string): Promise<void> {
  await page.getByRole("tab", { name: /Authorizations/ }).click();
  await page.getByRole("button", { name: new RegExp(`^${id}\\b`) }).click();
  await expect(page.getByText(id, { exact: true })).toBeVisible();
}

async function pickDepartment(page: Page, side: Side, name: string): Promise<void> {
  const picker = page.getByTestId(`picker-${side}`);
  await picker.getByLabel("Search departments by name").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}\\s`) }).click();
  await expect(page.getByTestId(`picker-${side}-chosen`)).toHaveText(name);
}

async function fillSide(page: Page, side: Side, dept: string, locationType: string): Promise<void> {
  await pickDepartment(page, side, dept);
  await page.locator(`#f-${side}-locationType`).selectOption({ label: locationType });
  await page.locator(`#f-${side}-location`).fill("Calder Point");
  await page.locator(`#f-${side}-billing`).fill("A. Example");
  await page.locator(`#f-${side}-pm`).fill("B. Example");
  await page.locator(`#f-${side}-finance`).fill("C. Example");
}

/** Raises and initiates a complete authorization, leaving its detail open. */
async function raise(page: Page, r: Raise): Promise<void> {
  await actAs(page, "Submitter");
  await page.getByRole("tab", { name: "New authorization" }).click();
  await page.getByLabel("Project").fill(r.project);
  await page.getByLabel("Funding type").selectOption({ label: r.funding });
  await fillSide(page, "requesting", r.requesting.dept, r.requesting.locationType);
  await fillSide(page, "performing", r.performing.dept, r.performing.locationType);
  await page.getByRole("button", { name: "Initiate into the relay" }).click();
  await expect(page.getByRole("status")).toContainText("initiated");
  await expect(page.getByRole("heading", { name: r.project })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await open(page);
});

test("it opens on seeded authorizations under a fictional-data disclosure", async ({ page }) => {
  await expect(page.getByTestId("disclosure")).toContainText("fictional");
  await expect(page.getByRole("button", { name: /^IWA-\d+/ })).toHaveCount(10);
});

test("every role has something waiting on it in the seed", async ({ page }) => {
  const roles = [
    "Submitter", "Requesting program manager", "Requesting finance", "Performing contributor",
    "Performing program manager", "Performing finance", "Contracts", "Global Trade",
    "Charge Number Admin",
  ];
  await page.getByRole("button", { name: /Waiting on me/ }).click();
  for (const role of roles) {
    await actAs(page, role);
    await expect(page.getByRole("button", { name: /^IWA-\d+/ }).first(), role).toBeVisible();
  }
});

test("choosing a department fills in the lookup fields", async ({ page }) => {
  await page.getByRole("tab", { name: "New authorization" }).click();
  await pickDepartment(page, "requesting", "Vibration Lab");

  const picker = page.getByTestId("picker-requesting");
  await expect(picker).toContainText("Filled in from the department");
  await expect(picker).toContainText("Calderis Avionics Ltd");
  await expect(picker).toContainText("Labs");
  await expect(picker).toContainText("CAL-5112");
  await expect(picker).toContainText("TP-51120");
  await expect(picker).toContainText("ERP-CAL-51");
});

test("narrowing by attribute and then searching by name reaches a department", async ({ page }) => {
  await page.getByRole("tab", { name: "New authorization" }).click();
  const picker = page.getByTestId("picker-performing");

  await expect(picker).toContainText("32 of 32 departments");
  await picker.getByLabel("Jurisdiction").selectOption({ label: "Foreign" });
  await expect(picker).toContainText("9 of 32 departments");
  await picker.getByLabel("Legal entity").selectOption({ label: "Calderis Aerospace" });
  await expect(picker).toContainText("4 of 32 departments");
  await picker.getByLabel("Search departments by name").fill("Canada");
  await expect(picker).toContainText("1 of 32 departments");

  await picker.getByRole("button", { name: /^Calderis Canada, Inc\./ }).click();
  await expect(page.getByTestId("picker-performing-chosen")).toHaveText("Calderis Canada, Inc.");
});

test("an impermissible pairing is refused the moment both departments are chosen", async ({ page }) => {
  await page.getByRole("tab", { name: "New authorization" }).click();
  await pickDepartment(page, "requesting", "Secure Software & Services");
  await pickDepartment(page, "performing", "Calderis Deutschland GmbH");

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("not permitted");
  await expect(alert).toContainText("Secure Software & Services with Calderis Deutschland GmbH");
  await expect(alert).toContainText("the combination is not allowed");
});

test("initiation is blocked while a field is unsupplied", async ({ page }) => {
  await page.getByRole("tab", { name: "New authorization" }).click();
  await page.getByLabel("Project").fill("Incomplete request");
  await page.getByRole("button", { name: "Initiate into the relay" }).click();

  await expect(page.getByRole("alert")).toContainText("still needed before this can be initiated");
  await expect(page.getByText("Funding type is required")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New authorization" })).toBeVisible();
});

test("a customer-contract funding type routes through Contracts; company funded skips it", async ({ page }) => {
  await raise(page, {
    project: "Contract-funded request",
    funding: "Government negotiated contract",
    requesting: { dept: "Heat Exchange Products", locationType: "Domestic" },
    performing: { dept: "Emissions Lab", locationType: "Domestic" },
  });
  await expect(page.getByTestId("route")).toContainText("Contracts");
  await expect(page.getByTestId("route")).not.toContainText("Contracts — skipped");

  await raise(page, {
    project: "Company-funded request",
    funding: "Company funded",
    requesting: { dept: "Heat Exchange Products", locationType: "Domestic" },
    performing: { dept: "Emissions Lab", locationType: "Domestic" },
  });
  await expect(page.getByTestId("route")).toContainText("Contracts — skipped");
});

test("differing location types route through Global Trade; matching ones skip it", async ({ page }) => {
  await raise(page, {
    project: "Cross-border request",
    funding: "Company funded",
    requesting: { dept: "Heat Exchange Products", locationType: "Domestic" },
    performing: { dept: "Calderis UK Limited", locationType: "International" },
  });
  await expect(page.getByTestId("route")).toContainText("Global Trade");
  await expect(page.getByTestId("route")).not.toContainText("Global Trade — skipped");

  await raise(page, {
    project: "Same-country request",
    funding: "Company funded",
    requesting: { dept: "Heat Exchange Products", locationType: "Domestic" },
    performing: { dept: "Emissions Lab", locationType: "Domestic" },
  });
  await expect(page.getByTestId("route")).toContainText("Global Trade — skipped");
});

test("acknowledging at a stage advances the authorization to the next stage", async ({ page }) => {
  await actAs(page, "Requesting program manager");
  await openAuthorization(page, "IWA-2041");
  await expect(page.getByTestId("detail-state")).toHaveText("Requesting program manager");

  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByRole("status")).toContainText("Now with Requesting finance");
  await expect(page.getByTestId("detail-state")).toHaveText("Requesting finance");
});

test("a correction request holds the authorization at its stage and surfaces it to the submitter", async ({ page }) => {
  await actAs(page, "Requesting finance");
  await openAuthorization(page, "IWA-2042");

  await page.getByRole("button", { name: "Raise correction request" }).first().click();
  await page.getByLabel("Requesting billing contact").check();
  await page.getByLabel(/Comment to the owner/).fill("This contact has moved teams.");
  await page.getByRole("button", { name: "Raise correction request" }).last().click();

  await expect(page.getByRole("status")).toContainText("has not moved");
  await expect(page.getByTestId("detail-state")).toHaveText("Awaiting correction");
  await expect(page.getByTestId("route").locator(".here")).toHaveText("Requesting finance");

  await page.getByRole("button", { name: "Back to list" }).click();
  await page.getByRole("button", { name: /Waiting on me/ }).click();
  await expect(page.getByRole("button", { name: /^IWA-2042\b/ })).toHaveCount(0);
  await actAs(page, "Submitter");
  await expect(page.getByRole("button", { name: /^IWA-2042\b/ })).toBeVisible();
});

test("correcting in place returns the authorization to the stage that raised the request", async ({ page }) => {
  await openAuthorization(page, "IWA-2050");
  await page.getByLabel("Performing billing contact").fill("W. Osei");
  await page.getByLabel("Budget hours").fill("180");
  await page.getByRole("button", { name: "Supply correction" }).click();

  await expect(page.getByRole("status")).toContainText("Back with Performing program manager");
  await actAs(page, "Performing program manager");
  await expect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
});

test("minting a charge number completes the authorization", async ({ page }) => {
  await actAs(page, "Charge Number Admin");
  await openAuthorization(page, "IWA-2048");

  await page.getByLabel("Charge number").fill("CN-10000-0001");
  await page.getByRole("button", { name: "Mint charge number" }).click();

  await expect(page.getByTestId("detail-state")).toHaveText("Completed");
  await expect(page.getByText("CN-10000-0001").first()).toBeVisible();
});

test("reset restores the seeded state", async ({ page }) => {
  await actAs(page, "Requesting program manager");
  await openAuthorization(page, "IWA-2041");
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByTestId("detail-state")).toHaveText("Requesting finance");

  await page.getByRole("button", { name: "Reset to seeded data" }).click();
  await expect(page.getByRole("status")).toContainText("Reset to the seeded data");
  await openAuthorization(page, "IWA-2041");
  await expect(page.getByTestId("detail-state")).toHaveText("Requesting program manager");
});
