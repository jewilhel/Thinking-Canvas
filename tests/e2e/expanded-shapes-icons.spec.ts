import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const password = "LocalPassword1!";

async function openFreshCanvas(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("owner@thinking-canvas.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Canvas name").fill(`Icon canvas ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "Open Object navigator" }).click();
}

test("adds expanded shapes and styles a searchable vector icon", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  const shapePalette = page.getByTestId("workspace-shape-palette");
  const catalogSearch = page.getByLabel("Search shapes and icons");
  const basicCategory = page.getByRole("button", {
    name: "Basic",
    exact: true,
  });
  await expect(basicCategory).toBeVisible();
  await expect(page.getByText("1524 results")).toBeVisible();
  const roundedRectangleTile = page.getByTestId(
    "basic-shape-tile-rounded-rectangle",
  );
  await expect(
    roundedRectangleTile.getByText("Rounded rectangle"),
  ).toBeVisible();
  expect(
    await roundedRectangleTile.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect(roundedRectangleTile.locator("svg")).toHaveAttribute(
    "fill",
    "currentColor",
  );
  const previewBox = await roundedRectangleTile.locator("svg").boundingBox();
  const labelBox = await roundedRectangleTile
    .getByText("Rounded rectangle")
    .boundingBox();
  expect(previewBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(previewBox!.width).toBeGreaterThanOrEqual(36);
  expect(previewBox!.y + previewBox!.height).toBeLessThanOrEqual(labelBox!.y);
  const iconPreviewBox = await page
    .getByTestId("icon-tile")
    .first()
    .locator("svg")
    .boundingBox();
  expect(iconPreviewBox).not.toBeNull();
  expect(previewBox!.width).toBeGreaterThanOrEqual(iconPreviewBox!.width);
  await basicCategory.click();
  await expect(page.getByText("12 results")).toBeVisible();
  await expect(page.getByTestId("icon-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByText("1524 results")).toBeVisible();
  await catalogSearch.fill("rounded rectangle");
  await expect(roundedRectangleTile).toBeVisible();
  await catalogSearch.fill("");
  await page
    .getByRole("button", { name: "Star — basic shape", exact: true })
    .click();
  await surface.click({ position: { x: 280, y: 220 } });
  await expect(
    page.locator('[data-testid^="object-list-item-"]').filter({
      hasText: "star",
    }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await expect(page.getByText("1524 results")).toBeVisible();
  expect(
    await shapePalette.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const paletteBox = await shapePalette.boundingBox();
  const searchBox = await page
    .getByLabel("Search shapes and icons")
    .boundingBox();
  const resultsBox = await page.getByTestId("catalog-results").boundingBox();
  expect(paletteBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(resultsBox).not.toBeNull();
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(
    paletteBox!.x + paletteBox!.width,
  );
  expect(resultsBox!.x + resultsBox!.width).toBeLessThanOrEqual(
    paletteBox!.x + paletteBox!.width,
  );
  const visibleTiles = page.getByTestId("icon-tile");
  await expect(visibleTiles.first()).toBeVisible();
  expect(await visibleTiles.count()).toBeLessThan(100);
  await page.getByLabel("Search shapes and icons").fill("brain");
  await page.getByTitle("Brain", { exact: true }).click();
  await expect(
    page.locator('[data-testid^="object-list-item-"]').filter({
      hasText: "icon — brain",
    }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Fill" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stroke" })).toBeVisible();

  await page.getByRole("button", { name: "Stroke" }).click();
  await page.getByRole("button", { name: "No stroke" }).click();
  await expect(page.getByTestId("selected-stroke-width")).toHaveText("0");

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="thinking-workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("places an icon inside a sticky and removes it without a jump", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");

  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({ position: { x: 540, y: 280 } });

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Search shapes and icons").fill("brain");
  await page.getByTitle("Brain", { exact: true }).click();
  const iconItem = page.locator('[data-testid^="object-list-item-"]').filter({
    hasText: "icon — brain",
  });
  await iconItem.click();

  const beforeX = await page.getByTestId("selected-position-x").innerText();
  const beforeY = await page.getByTestId("selected-position-y").innerText();
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: /Place inside rectangle/ }).click();
  await expect(iconItem).toHaveAttribute(
    "aria-label",
    /Contained icon — brain/,
  );

  await iconItem.click();
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Remove from container" }).click();
  await expect(iconItem).toHaveAttribute("aria-label", "icon — brain");
  await expect(page.getByTestId("selected-position-x")).toHaveText(beforeX);
  await expect(page.getByTestId("selected-position-y")).toHaveText(beforeY);
});
