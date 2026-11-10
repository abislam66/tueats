import { expect, test, type Page } from "@playwright/test";

/**
 * Runs against the dev database, so nothing here hardcodes a venue name:
 * tests read the first rows the list shows. Read-only — no reports,
 * ratings or photos are submitted.
 */

async function openHome(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForSelector(".venue-row", { timeout: 30_000 });
  // Let the map settle so selection flights don't race the first paint.
  await page.waitForTimeout(2500);
}

test("desktop: persistent list pane with status groups, no sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  const pane = page.getByRole("complementary", { name: "Places" });
  await expect(pane).toBeVisible();
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);

  // The first group is always one of the four status headings, in order.
  const headings = await pane.locator(".venue-group-title").allTextContents();
  const order = [
    "Open late, latest first",
    "Closing within the hour",
    "Opens later",
    "Hours unknown",
  ];
  expect(headings.length).toBeGreaterThan(0);
  const indices = headings.map((h) => order.indexOf(h));
  expect(indices.every((i) => i >= 0)).toBe(true);
  expect([...indices].sort((a, b) => a - b)).toEqual(indices);

  // Header shows the live campus time and the desktop nav.
  const header = page.locator(".site-header");
  await expect(
    header.getByText(/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, /),
  ).toBeVisible();
  await expect(header.getByRole("link", { name: "About" })).toBeVisible();

  // Map legend.
  await expect(page.getByRole("list", { name: "Pin colors" })).toContainText(
    "Closing soon",
  );
});

test("desktop: Open now chip filters and keeps URL state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  const all = await page.locator(".venue-row").count();
  const chip = page.getByRole("button", { name: "Open now" });
  await chip.click();
  await expect(page).toHaveURL(/open=1/);
  await expect(
    page.locator(".venue-group-title", { hasText: "Opens later" }),
  ).toHaveCount(0);
  expect(await page.locator(".venue-row").count()).toBeLessThanOrEqual(all);

  const search = page.getByRole("searchbox", {
    name: "Search venues or cuisines",
  });
  await search.fill("zzzzqq");
  await expect(page).toHaveURL(/q=zzzzqq/);
  await expect(
    page.getByRole("heading", { name: "Nothing open matches" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).not.toHaveURL(/open=1|q=/);
  expect(await page.locator(".venue-row").count()).toBe(all);
});

test("desktop: a row selects the venue (mini-card), it does not navigate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  const row = page.locator(".venue-row").first();
  const name = (await row.locator(".venue-row-name").textContent())?.trim();
  await row.click();

  const card = page.locator(".map-mini-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(card.locator(".map-mini-card-name")).toHaveText(name ?? "");
  await expect(
    card.getByRole("link", { name: "Get directions" }),
  ).toHaveAttribute("href", /google\.com\/maps\/dir/);

  await card.getByRole("link", { name: "View details" }).click();
  await expect(page).toHaveURL(/\/eat\//);
});

test("phone: sheet detents and a row tap opens the preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForSelector(".sheet-handle");

  // Starts collapsed (map only), tap to peek, tap to full.
  const handle = page.locator(".sheet-handle");
  await expect(handle).toHaveAttribute("aria-label", /Results sheet map/);
  await handle.click();
  await expect(handle).toHaveAttribute("aria-label", /Results sheet peek/);
  await handle.click();
  await expect(handle).toHaveAttribute("aria-label", /Results sheet full/);

  const row = page.locator(".venue-row").first();
  const name = (await row.locator(".venue-row-name").textContent())?.trim();
  await row.click();

  const preview = page.locator(".venue-preview");
  await expect(preview).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(preview.locator("h2")).toHaveText(name ?? "");
  await expect(
    preview.getByRole("link", { name: "Get directions" }),
  ).toBeVisible();
  await preview.getByRole("link", { name: "View details" }).click();
  await expect(page).toHaveURL(/\/eat\//);
});

test("place page is public: status card first, sign-in only to rate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // ?view=restaurants opens the sheet so the rows are tappable.
  await openHome(page, "/?view=restaurants");
  // Open a place through the UI, the way a visitor would.
  await page.locator(".venue-row").first().click();
  await page
    .locator(".venue-preview")
    .getByRole("link", { name: "View details" })
    .click();
  await expect(page).toHaveURL(/\/eat\//);

  await expect(
    page.getByRole("link", { name: "Back to the map" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const card = page.getByRole("region", { name: "Open status" });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Get directions" }),
  ).toBeVisible();
  await expect(
    card.getByText("Hours are a guide. Schedules can change."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Usual hours" }),
  ).toBeVisible();

  // Anonymous visitors see a sign-in prompt where the review form would be.
  await expect(
    page.getByRole("heading", { name: "What students think" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sign in to rate this place or add a photo."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a photo" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page).toHaveURL(/\/($|\?)/);
});
