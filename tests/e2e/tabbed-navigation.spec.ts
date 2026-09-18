import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The tab shell (#91): a persistent header - the acting-as switcher, the
 * store-info panel, the reset control, the participant roster, and
 * revocation notices - stays visible above tab content no matter which tab
 * is open, and only the active tab's content is visible at a time.
 *
 * Every tab mounts up front and stays mounted - switching only toggles
 * visibility (`Tabs.tsx`) - the same as every section always being mounted
 * on the one scrolling page this shell replaces, so these tests assert
 * visibility, never DOM presence, for another tab's content.
 *
 * Reading the hierarchy tree and the permissibility rules stays open to
 * everyone (HierarchyAdmin.tsx: "the same as every other reference-data
 * read"), so unlike issue #91's literal Admin-tab wording, the tab holding
 * them - Reference Data - is not Administrator-only. Only the mutation
 * controls inside it are, unchanged from before this issue.
 */

async function initiateAuthorization(page: Page, project: string): Promise<void> {
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

test("only the active tab's content is visible", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("my-drafts")).toBeVisible();
  await expect(page.getByTestId("my-queue")).not.toBeVisible();
  await expect(page.getByTestId("master-dashboard")).not.toBeVisible();
  await expect(page.getByTestId("insights-dashboard")).not.toBeVisible();
  await expect(page.getByTestId("permissibility-rules")).not.toBeVisible();
  await expect(page.getByTestId("hierarchy-admin")).not.toBeVisible();

  await page.getByRole("tab", { name: "My Queue" }).click();
  await expect(page.getByTestId("my-queue")).toBeVisible();
  await expect(page.getByTestId("my-drafts")).not.toBeVisible();

  await page.getByRole("tab", { name: "All Authorizations" }).click();
  await expect(page.getByTestId("master-dashboard")).toBeVisible();
  await expect(page.getByTestId("my-queue")).not.toBeVisible();

  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("insights-dashboard")).toBeVisible();
  await expect(page.getByTestId("master-dashboard")).not.toBeVisible();

  await page.getByRole("tab", { name: "Reference Data" }).click();
  await expect(page.getByTestId("permissibility-rules")).toBeVisible();
  await expect(page.getByTestId("hierarchy-admin")).toBeVisible();
  await expect(page.getByTestId("insights-dashboard")).not.toBeVisible();

  await page.getByRole("tab", { name: "My Queue" }).click();
  await expect(page.getByTestId("my-queue")).toBeVisible();
  await expect(page.getByTestId("permissibility-rules")).not.toBeVisible();
});

test("arrow keys move focus and selection between tabs, and Home/End jump to the ends", async ({ page }) => {
  await page.goto("/");

  const submit = page.getByRole("tab", { name: "Submit" });
  const myQueue = page.getByRole("tab", { name: "My Queue" });
  const referenceData = page.getByRole("tab", { name: "Reference Data" });

  await submit.focus();
  await page.keyboard.press("ArrowRight");
  await expect(myQueue).toBeFocused();
  await expect(myQueue).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("my-queue")).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(submit).toBeFocused();
  await expect(submit).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("End");
  await expect(referenceData).toBeFocused();
  await expect(referenceData).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Home");
  await expect(submit).toBeFocused();
  await expect(submit).toHaveAttribute("aria-selected", "true");
});

test("a queue arrival while looking at another tab is still shown on return", async ({ page, context }) => {
  // MyQueue.tsx polls from mount, standing in for CONTEXT.md's
  // "Notification" push - and mounts up front with every other tab
  // (Tabs.tsx), so this holds even for a participant who never opens "My
  // Queue" during the session, not only one who opened it and looked away.
  // This covers the notification banner's presence for a sighted user, not
  // whether it fires an assistive-technology live-region announcement while
  // its tab is inactive - the ARIA tabs pattern removes an inactive panel
  // from the accessibility tree by design, same as any other tab widget.
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await page.getByRole("tab", { name: "My Queue" }).click();
  await expect(page.getByTestId("my-queue")).toBeVisible();

  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("insights-dashboard")).toBeVisible();

  const project = `Tab Away Arrival ${Date.now()}`;
  const submitterPage = await context.newPage();
  await initiateAuthorization(submitterPage, project);
  await submitterPage.close();

  await page.getByRole("tab", { name: "My Queue" }).click();
  await expect(
    page.getByTestId("arrival-notification").filter({ hasText: project }),
  ).toBeVisible({ timeout: 10_000 });
});

test("a queue arrival while looking at another tab updates a live region for assistive technology", async ({
  page,
  context,
}) => {
  // The visible notification banner above lives inside the "My Queue"
  // tabpanel, which the browser removes from the accessibility tree while
  // another tab is active (the ARIA tabs pattern, same as any tab widget) -
  // so a screen-reader user relies instead on MyQueue's own always-mounted,
  // visually-hidden `aria-live="polite"` region, portaled to `document.body`
  // and kept updated regardless of which tab is showing or whether "My
  // Queue" was ever opened.
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("insights-dashboard")).toBeVisible();

  const project = `Live Region Arrival ${Date.now()}`;
  const submitterPage = await context.newPage();
  await initiateAuthorization(submitterPage, project);
  await submitterPage.close();

  await expect(page.getByTestId("queue-arrival-announcement")).toContainText(
    `${project} has arrived in your queue.`,
    { timeout: 10_000 },
  );
  // Still on Insights - the region updated without switching tabs.
  await expect(page.getByTestId("insights-dashboard")).toBeVisible();
});

test("two arrivals in the same poll cycle are both named in the live region, not just the last", async ({
  page,
  context,
}) => {
  // A plain `setState` call per arrival, inside a loop, collapses under
  // React's batching - only the last one would ever reach the DOM. MyQueue
  // builds one combined announcement per poll instead, so this asserts both
  // projects survive together rather than the second silently winning.
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-cate-marchetti");
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("insights-dashboard")).toBeVisible();

  const ts = Date.now();
  const projectOne = `Batched Arrival One ${ts}`;
  const projectTwo = `Batched Arrival Two ${ts}`;

  // Concurrent, not sequential, so both land inside the same poll window
  // rather than risking a poll tick falling between the two.
  const submitterPageOne = await context.newPage();
  const submitterPageTwo = await context.newPage();
  await Promise.all([
    initiateAuthorization(submitterPageOne, projectOne),
    initiateAuthorization(submitterPageTwo, projectTwo),
  ]);
  await Promise.all([submitterPageOne.close(), submitterPageTwo.close()]);

  const announcement = page.getByTestId("queue-arrival-announcement");
  await expect(announcement).toContainText(`${projectOne} has arrived in your queue.`, { timeout: 10_000 });
  await expect(announcement).toContainText(`${projectTwo} has arrived in your queue.`);
});

test("the Reference Data tab is reachable acting as a non-Administrator, read-only", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Participant", { exact: true }).selectOption("p-avery-lund"); // a Contributor

  await page.getByRole("tab", { name: "Reference Data" }).click();
  await expect(page.getByTestId("permissibility-rules")).toBeVisible();
  await expect(page.getByTestId("hierarchy-admin")).toBeVisible();
  await expect(page.getByTestId("permissibility-rules").getByTestId("add-permissibility-rule")).toHaveCount(0);
  await expect(page.getByTestId("hierarchy-admin").getByTestId("hierarchy-add-form")).toHaveCount(0);
});

test("header controls stay visible and functional regardless of the active tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Insights" }).click();

  await expect(page.getByTestId("store-info")).toBeVisible();

  const select = page.getByLabel("Participant", { exact: true });
  await select.selectOption("p-erez-caldwell");
  await expect(page.getByTestId("acting-detail")).toContainText("Erez Caldwell");

  // Switching identity doesn't kick the presenter back to another tab.
  await expect(page.getByTestId("insights-dashboard")).toBeVisible();

  await page.getByRole("button", { name: "Reset the store" }).click();
  await expect(page.getByRole("button", { name: "Reset the store" })).toBeEnabled();
});

test("Submit is the default tab on load", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("tab", { name: "Submit", selected: true })).toBeVisible();
  await expect(page.getByTestId("my-drafts")).toBeVisible();
});
