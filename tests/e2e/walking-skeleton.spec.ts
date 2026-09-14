import { test, expect } from "@playwright/test";

/**
 * What the seam cannot express: that a person opening one URL sees the store
 * read back to them, and can say who they are acting as.
 */

test("the page reads the store through the service", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Work Authorization" })).toBeVisible();

  const info = page.getByTestId("store-info");
  await expect(info).toBeVisible();
  await expect(page.getByTestId("participant-count")).toHaveText(/^\d+$/);

  // The roster came from SQLite, not from a hardcoded list in the bundle.
  const rows = page.getByTestId("participant-rows").locator("tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
});

test("the switcher chooses who is acting", async ({ page }) => {
  await page.goto("/");

  const detail = page.getByTestId("acting-detail");
  await expect(detail).toContainText("the product itself");

  const select = page.getByLabel("Participant", { exact: true });
  await select.selectOption("p-erez-caldwell");

  await expect(detail).toContainText("Erez Caldwell");
  await expect(detail).toContainText("Administrator");
});

test("the store can be reset from the page", async ({ page }) => {
  await page.goto("/");

  const seeded = page.getByTestId("store-info").locator("dd").nth(1);
  const before = await seeded.textContent();

  await page.getByRole("button", { name: "Reset the store" }).click();

  await expect(page.getByRole("button", { name: "Reset the store" })).toBeEnabled();
  await expect(page.getByTestId("participant-count")).toHaveText(/^\d+$/);
  await expect(seeded).not.toHaveText(before ?? "");
});

test("the four roles of the cast appear, and Submitter does not", async ({ page }) => {
  await page.goto("/");

  const roleCells = page.getByTestId("participant-rows").locator("td:nth-child(2)");
  const roles = new Set(await roleCells.allTextContents());

  for (const role of ["Contributor", "Approver", "Charge Number Admin", "Administrator"]) {
    expect(roles).toContain(role);
  }
  expect(roles).not.toContain("Submitter");
});

test("a request that names nobody is refused rather than treated as the system", async ({
  request,
}) => {
  // Defaulting a missing header to `system` would hand the one identity that
  // skips the roster check to any request that omits it - and a request with no
  // custom header needs no preflight, so any page could have sent it.
  const anonymous = await request.post("/api/store/reset");
  expect(anonymous.status()).toBe(400);
  expect((await anonymous.json()).code).toBe("INVALID_REQUEST");

  const unknown = await request.post("/api/store/reset", {
    headers: { "x-acting-participant": "nobody-at-all" },
  });
  expect(unknown.status()).toBe(403);
  expect((await unknown.json()).code).toBe("UNKNOWN_PARTICIPANT");

  const known = await request.post("/api/store/reset", {
    headers: { "x-acting-participant": "p-erez-caldwell" },
  });
  expect(known.status()).toBe(200);
});
