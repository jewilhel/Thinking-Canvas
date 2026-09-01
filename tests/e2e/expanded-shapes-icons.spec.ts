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
  await expect(shapePalette).toBeVisible();
  await surface.click({ position: { x: 80, y: 80 } });
  await expect(shapePalette).toBeHidden();
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
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
  await expect(
    page.getByRole("button", { name: "Contained intrinsic label" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Search shapes and icons").fill("brain");
  await page.getByTitle("Brain", { exact: true }).click();
  const iconItem = page.locator('[data-testid^="object-list-item-"]').filter({
    hasText: "icon — brain",
  });
  await iconItem.click();

  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: /Place inside rectangle/ }).click();
  await expect(iconItem).toHaveAttribute(
    "aria-label",
    /Contained icon — brain/,
  );
  await page.getByRole("button", { name: "More selection actions" }).click();
  await expect(page.getByLabel("Pin position")).toBeChecked();
  await expect(page.getByLabel("Scale width")).toBeChecked();
  await page.getByLabel("Scale width").uncheck();
  await expect(page.getByLabel("Scale width")).not.toBeChecked();
  await page.getByLabel("Rotation").fill("30");
  await expect(page.getByTestId("selected-rotation")).toHaveText("30°");
  const beforeDetachX = await page
    .getByTestId("selected-position-x")
    .innerText();
  const beforeDetachY = await page
    .getByTestId("selected-position-y")
    .innerText();

  await iconItem.click();
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Remove from container" }).click();
  await expect(iconItem).toHaveAttribute("aria-label", "icon — brain");
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    beforeDetachX,
  );
  await expect(page.getByTestId("selected-position-y")).toHaveText(
    beforeDetachY,
  );
});

test("selects a composition parent first and exposes rotation at every corner", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({ position: { x: 300, y: 300 } });

  const parentItem = page.getByRole("button", {
    name: "rectangle — Sticky note",
    exact: true,
  });
  const labelItem = page.getByRole("button", {
    name: "Contained intrinsic label",
  });
  await surface.click({ position: { x: 70, y: 200 } });
  await surface.click({ position: { x: 350, y: 350 } });
  await expect(parentItem).toHaveAttribute("aria-pressed", "true");
  await expect(labelItem).toHaveAttribute("aria-pressed", "false");
  await surface.dragTo(surface, {
    sourcePosition: { x: 350, y: 350 },
    targetPosition: { x: 390, y: 380 },
  });
  await expect(parentItem).toHaveAttribute("aria-pressed", "true");
  await expect(labelItem).toHaveAttribute("aria-pressed", "false");
  await surface.click({ position: { x: 390, y: 380 } });
  await expect(labelItem).toHaveAttribute("aria-pressed", "true");

  await parentItem.click();
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
  const viewportY = Number(await surface.getAttribute("data-viewport-y"));
  const viewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  const objectX = Number(
    await page.getByTestId("selected-position-x").innerText(),
  );
  const objectY = Number(
    await page.getByTestId("selected-position-y").innerText(),
  );
  const objectWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  const objectHeight = Number(
    await page.getByTestId("selected-height").innerText(),
  );
  const corners = [
    ["top-left", objectX, objectY],
    ["top-right", objectX + objectWidth, objectY],
    ["bottom-left", objectX, objectY + objectHeight],
    ["bottom-right", objectX + objectWidth, objectY + objectHeight],
  ] as const;
  const rotationButton = page.getByRole("button", {
    name: "Rotate selected object",
  });
  for (const [corner, x, y] of corners) {
    await page.mouse.move(
      surfaceBox!.x + viewportX + x * viewportScale,
      surfaceBox!.y + viewportY + y * viewportScale,
    );
    await expect(rotationButton).toHaveAttribute(
      "data-rotation-corner",
      corner,
    );
  }

  await page.mouse.move(
    surfaceBox!.x + viewportX + (objectX + objectWidth) * viewportScale,
    surfaceBox!.y + viewportY + objectY * viewportScale,
  );
  const rotationButtonBox = await rotationButton.boundingBox();
  expect(rotationButtonBox).not.toBeNull();
  await page.mouse.move(
    rotationButtonBox!.x + rotationButtonBox!.width / 2,
    rotationButtonBox!.y + rotationButtonBox!.height / 2,
  );
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(
    surfaceBox!.x +
      viewportX +
      (objectX + objectWidth / 2 + objectHeight / 2 + 10) * viewportScale,
    surfaceBox!.y +
      viewportY +
      (objectY + objectHeight / 2 + objectWidth / 2 + 10) * viewportScale,
  );
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selected-rotation")).toHaveText("90°");
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(objectX + objectWidth / 2 + objectHeight / 2),
  );
  await expect(page.getByTestId("selected-position-y")).toHaveText(
    String(objectY + objectHeight / 2 - objectWidth / 2),
  );
});
