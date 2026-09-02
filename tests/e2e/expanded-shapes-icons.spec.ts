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
  const parentX = Number(
    await page.getByTestId("selected-position-x").innerText(),
  );
  const parentY = Number(
    await page.getByTestId("selected-position-y").innerText(),
  );
  const parentWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  const parentHeight = Number(
    await page.getByTestId("selected-height").innerText(),
  );
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
  const constraints = page.getByRole("group", { name: "Constraints" });
  const horizontalConstraint = constraints.getByLabel("Horizontal constraint");
  const verticalConstraint = constraints.getByLabel("Vertical constraint");
  await expect(horizontalConstraint).toHaveValue("left");
  await expect(verticalConstraint).toHaveValue("top");
  await expect(horizontalConstraint.locator("option")).toHaveText([
    "Left",
    "Right",
    "Left + Right",
    "Center",
    "Scale",
  ]);
  await expect(verticalConstraint.locator("option")).toHaveText([
    "Top",
    "Bottom",
    "Top + Bottom",
    "Center",
    "Scale",
  ]);
  await horizontalConstraint.selectOption("center");
  await expect(horizontalConstraint).toHaveValue("center");
  const childWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(Math.round(parentX + (parentWidth - childWidth) / 2)),
  );
  await verticalConstraint.selectOption("center");
  const childHeight = Number(
    await page.getByTestId("selected-height").innerText(),
  );
  await expect(page.getByTestId("selected-position-y")).toHaveText(
    String(Math.round(parentY + (parentHeight - childHeight) / 2)),
  );
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
  const viewportXAfterDrag = Number(
    await surface.getAttribute("data-viewport-x"),
  );
  const viewportYAfterDrag = Number(
    await surface.getAttribute("data-viewport-y"),
  );
  const viewportScaleAfterDrag = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  const parentXAfterDrag = Number(
    await page.getByTestId("selected-position-x").innerText(),
  );
  const parentYAfterDrag = Number(
    await page.getByTestId("selected-position-y").innerText(),
  );
  const parentWidthAfterDrag = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  const parentHeightAfterDrag = Number(
    await page.getByTestId("selected-height").innerText(),
  );
  const parentBorderPoint = {
    x: viewportXAfterDrag + (parentXAfterDrag + 5) * viewportScaleAfterDrag,
    y: viewportYAfterDrag + (parentYAfterDrag + 5) * viewportScaleAfterDrag,
  };
  const parentCenterPoint = {
    x:
      viewportXAfterDrag +
      (parentXAfterDrag + parentWidthAfterDrag / 2) * viewportScaleAfterDrag,
    y:
      viewportYAfterDrag +
      (parentYAfterDrag + parentHeightAfterDrag / 2) * viewportScaleAfterDrag,
  };
  await surface.dblclick({ position: parentBorderPoint });
  const inlineEditor = page.getByLabel("Edit object text on canvas");
  await expect(inlineEditor).toBeFocused();
  await inlineEditor.press("Escape");
  await parentItem.click();
  await surface.click({ position: parentCenterPoint });
  await expect(labelItem).toHaveAttribute("aria-pressed", "true");

  await parentItem.click();
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
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
  const rotationZones = page.getByTestId("rotation-cursor-zone");
  await expect(rotationZones).toHaveCount(4);
  for (const corner of [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]) {
    const exactZone = page.locator(
      `[data-testid="rotation-cursor-zone"][data-rotation-corner="${corner}"]`,
    );
    await expect(exactZone).toHaveCSS("width", "28px");
    await expect(exactZone).toHaveCSS("height", "28px");
    await expect(exactZone).toHaveCSS("cursor", /data:image\/svg\+xml/);
  }

  const topRightZone = page.locator(
    '[data-testid="rotation-cursor-zone"][data-rotation-corner="top-right"]',
  );
  const initialTopRightBox = await topRightZone.boundingBox();
  expect(initialTopRightBox).not.toBeNull();
  expect(
    initialTopRightBox!.x +
      initialTopRightBox!.width / 2 -
      (surfaceBox!.x + viewportX + (objectX + objectWidth) * viewportScale),
  ).toBeCloseTo(18, 0);
  await page.getByRole("button", { name: "Zoom in" }).click();
  const zoomedTopRightBox = await topRightZone.boundingBox();
  expect(zoomedTopRightBox).not.toBeNull();
  expect(zoomedTopRightBox!.width).toBe(initialTopRightBox!.width);
  expect(zoomedTopRightBox!.height).toBe(initialTopRightBox!.height);
  const zoomedViewportX = Number(await surface.getAttribute("data-viewport-x"));
  const zoomedViewportY = Number(await surface.getAttribute("data-viewport-y"));
  const zoomedViewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  expect(
    zoomedTopRightBox!.x +
      zoomedTopRightBox!.width / 2 -
      (surfaceBox!.x +
        zoomedViewportX +
        (objectX + objectWidth) * zoomedViewportScale),
  ).toBeCloseTo(18, 0);

  await parentItem.click();
  await page.getByRole("button", { name: "More selection actions" }).click();
  const flipHorizontal = page.getByRole("button", { name: "Flip horizontal" });
  await flipHorizontal.click();
  await page.getByRole("button", { name: "More selection actions" }).click();
  await expect(
    page.getByRole("button", { name: "Flip horizontal" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  const rotationButton = page.locator(
    '[data-testid="rotation-cursor-zone"][data-rotation-corner="top-right"]',
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
      zoomedViewportX +
      (objectX + objectWidth / 2 + objectHeight / 2 + 10) * zoomedViewportScale,
    surfaceBox!.y +
      zoomedViewportY +
      (objectY + objectHeight / 2 + objectWidth / 2 + 10) * zoomedViewportScale,
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

test("rotates a grouped selection as one composition", async ({ page }) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("button", { name: "Rectangle — basic shape", exact: true })
    .click();
  await surface.click({ position: { x: 180, y: 180 } });
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("button", { name: "Ellipse — basic shape", exact: true })
    .click();
  await surface.click({ position: { x: 430, y: 180 } });

  const rectangle = page.getByRole("button", {
    name: "rectangle — New idea",
    exact: true,
  });
  const ellipse = page.getByRole("button", {
    name: "ellipse — New idea",
    exact: true,
  });
  await rectangle.click();
  await ellipse.click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Group", exact: true }).click();

  await expect(page.getByTestId("rotation-cursor-zone")).toHaveCount(4);
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByLabel("Rotation").fill("45");
  await expect(page.getByTestId("selected-rotation")).toHaveText("45°");
  await expect(rectangle).toHaveAttribute("aria-pressed", "true");
  await expect(ellipse).toHaveAttribute("aria-pressed", "true");
});

test("keeps grouped selection chrome tight and command-drags the group into a parent", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const center = {
    x: surfaceBox!.width / 2,
    y: surfaceBox!.height / 2,
  };

  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({
    position: { x: center.x - 100, y: center.y - 80 },
  });
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Search shapes and icons").fill("brain");
  await page.getByTitle("Brain", { exact: true }).click();
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Search shapes and icons").fill("arrow up");
  await page.getByTitle("Arrow Up", { exact: true }).click();

  const brain = page.locator('[data-testid^="object-list-item-"]').filter({
    hasText: "icon — brain",
  });
  const arrow = page.locator('[data-testid^="object-list-item-"]').filter({
    hasText: "icon — arrow-up",
  });
  await brain.click();
  await arrow.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-frame-geometry")).toHaveText(
    /,112,112$/,
  );
  await expect(page.getByTestId("visible-connection-anchor-count")).toHaveText(
    "0",
  );

  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.getByTestId("selection-frame-geometry")).toHaveText(
    /,112,112$/,
  );

  const containmentModifier = await page.evaluate(() =>
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.down(containmentModifier);
  await page.mouse.move(surfaceBox!.x + center.x, surfaceBox!.y + center.y);
  await page.mouse.down();
  await page.mouse.move(surfaceBox!.x + center.x + 8, surfaceBox!.y + center.y);
  await page.mouse.up();
  await page.keyboard.up(containmentModifier);

  await page.getByRole("button", { name: "More selection actions" }).click();
  await expect(
    page.getByRole("button", { name: "Remove group from container" }),
  ).toBeVisible();
  const constraints = page.getByRole("group", { name: "Constraints" });
  await expect(constraints.getByLabel("Horizontal constraint")).toHaveValue(
    "left",
  );
  await expect(constraints.getByLabel("Vertical constraint")).toHaveValue(
    "top",
  );
  await constraints.getByLabel("Horizontal constraint").selectOption("center");
  await constraints.getByLabel("Vertical constraint").selectOption("center");
  await expect(constraints.getByLabel("Horizontal constraint")).toHaveValue(
    "center",
  );
  await expect(constraints.getByLabel("Vertical constraint")).toHaveValue(
    "center",
  );
  await expect(page.getByTestId("visible-connection-anchor-count")).toHaveText(
    "0",
  );

  await page.getByRole("button", { name: "More selection actions" }).click();
  await page
    .locator('[data-testid^="object-list-item-"]:not([data-parent-id])')
    .first()
    .click();

  const frame = (await page.getByTestId("selection-frame-geometry").innerText())
    .split(",")
    .map(Number);
  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
  const viewportY = Number(await surface.getAttribute("data-viewport-y"));
  const viewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  const parentPoint = {
    x: surfaceBox!.x + viewportX + (frame[0]! + frame[2]! - 20) * viewportScale,
    y: surfaceBox!.y + viewportY + (frame[1]! + frame[3]! - 20) * viewportScale,
  };
  await page.mouse.move(parentPoint.x, parentPoint.y);
  await page.mouse.down();
  await page.mouse.move(parentPoint.x + 32, parentPoint.y + 24);
  await expect(page.getByTestId("live-drag-family-preview-count")).toHaveText(
    "4",
  );
  await page.mouse.up();

  const rotationZone = page.getByTestId("rotation-cursor-zone").first();
  const rotationBox = await rotationZone.boundingBox();
  expect(rotationBox).not.toBeNull();
  await page.mouse.move(
    rotationBox!.x + rotationBox!.width / 2,
    rotationBox!.y + rotationBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(rotationBox!.x + 44, rotationBox!.y + 44);
  await expect(page.getByTestId("live-descendant-preview-count")).toHaveText(
    "4",
  );
  await page.mouse.up();
});

test("nests an independent multiselection and groups the children on canvas", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const center = {
    x: surfaceBox!.width / 2,
    y: surfaceBox!.height / 2,
  };

  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({
    position: { x: center.x - 100, y: center.y - 80 },
  });
  const parent = page.getByRole("button", {
    name: "rectangle — Sticky note",
    exact: true,
  });
  const parentTestId = await parent.getAttribute("data-testid");
  const parentId = parentTestId?.replace("object-list-item-", "");
  expect(parentId).toBeTruthy();

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Search shapes and icons").fill("brain");
  await page.getByTitle("Brain", { exact: true }).click();
  await surface.focus();
  for (let index = 0; index < 2; index += 1) {
    await surface.press("Shift+ArrowLeft");
  }
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Search shapes and icons").fill("arrow up");
  await page.getByTitle("Arrow Up", { exact: true }).click();
  await surface.focus();
  for (let index = 0; index < 2; index += 1) {
    await surface.press("Shift+ArrowRight");
  }

  const brain = page.locator('[data-testid^="object-list-item-"]').filter({
    hasText: "icon — brain",
  });
  const arrow = page.locator('[data-testid^="object-list-item-"]').filter({
    hasText: "icon — arrow-up",
  });
  await brain.click();
  await arrow.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  const containmentModifier = await page.evaluate(() =>
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.down(containmentModifier);
  await page.mouse.move(surfaceBox!.x + center.x, surfaceBox!.y + center.y);
  await page.mouse.down();
  await page.mouse.move(surfaceBox!.x + center.x + 8, surfaceBox!.y + center.y);
  await page.mouse.up();
  await page.keyboard.up(containmentModifier);

  await expect(brain).toHaveAttribute("data-parent-id", parentId!);
  await expect(arrow).toHaveAttribute("data-parent-id", parentId!);
  await page.getByRole("button", { name: "More selection actions" }).click();
  await expect(
    page.getByRole("button", { name: "Group", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");

  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
  const viewportY = Number(await surface.getAttribute("data-viewport-y"));
  const viewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  await brain.click();
  const brainWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  const brainPoint = {
    x:
      viewportX +
      (Number(await page.getByTestId("selected-position-x").innerText()) +
        brainWidth * 0.1) *
        viewportScale,
    y:
      viewportY +
      (Number(await page.getByTestId("selected-position-y").innerText()) +
        Number(await page.getByTestId("selected-height").innerText()) / 2) *
        viewportScale,
  };
  await arrow.click();
  const arrowWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  const arrowPoint = {
    x:
      viewportX +
      (Number(await page.getByTestId("selected-position-x").innerText()) +
        arrowWidth * 0.5) *
        viewportScale,
    y:
      viewportY +
      (Number(await page.getByTestId("selected-position-y").innerText()) +
        Number(await page.getByTestId("selected-height").innerText()) / 2) *
        viewportScale,
  };

  await surface.click({ position: { x: 60, y: 420 } });
  await parent.click();
  await surface.click({ position: brainPoint });
  await expect(brain).toHaveAttribute("aria-pressed", "true");
  await surface.click({
    position: arrowPoint,
    modifiers: ["Shift"],
  });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "More selection actions" }).click();
  await expect(
    page.getByRole("button", { name: "Remove group from container" }),
  ).toBeVisible();
});

test("keeps inline text vertically aligned while editing", async ({ page }) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({ position: { x: 360, y: 320 } });
  await surface.dblclick({ position: { x: 410, y: 370 } });

  const editor = page.getByLabel("Edit object text on canvas");
  await expect(editor).toBeFocused();
  const [viewportY, viewportScale, objectY, objectHeight, editorBox] =
    await Promise.all([
      surface.getAttribute("data-viewport-y").then(Number),
      surface.getAttribute("data-viewport-scale").then(Number),
      page.getByTestId("selected-position-y").innerText().then(Number),
      page.getByTestId("selected-height").innerText().then(Number),
      editor.boundingBox(),
    ]);
  expect(editorBox).not.toBeNull();
  const expectedTop =
    surfaceBox!.y +
    viewportY +
    (objectY + objectHeight / 2) * viewportScale -
    editorBox!.height / 2;
  expect(editorBox!.y).toBeCloseTo(expectedTop, 0);
  expect(editorBox!.y).toBeGreaterThan(
    surfaceBox!.y + viewportY + objectY * viewportScale,
  );
  await editor.press("Escape");
});

test("does not recreate an intrinsic label after the child is deleted", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({ position: { x: 360, y: 320 } });

  const label = page.getByRole("button", {
    name: "Contained intrinsic label",
  });
  const objectItems = page.locator('[data-testid^="object-list-item-"]');
  await expect(objectItems).toHaveCount(2);
  await label.click();
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(label).toHaveCount(0);
  await expect(objectItems).toHaveCount(1);

  const emptyParent = page.getByRole("button", {
    name: "rectangle — Untitled",
    exact: true,
  });
  await expect(emptyParent).toBeVisible();
  await emptyParent.click();
  await surface.dblclick({ position: { x: 410, y: 370 } });
  await expect(page.getByLabel("Edit object text on canvas")).toHaveCount(0);
  await expect(objectItems).toHaveCount(1);
  await expect(label).toHaveCount(0);
});

test("keeps the contextual properties palette outside the selected frame", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("button", { name: "Rectangle — basic shape", exact: true })
    .click();
  await surface.click({ position: { x: 250, y: 100 } });
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Zoom out" }).click();
  }

  const toolbar = page.getByTestId("contextual-selection-controls");
  const toolbarBox = await toolbar.boundingBox();
  const surfaceBox = await surface.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();
  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
  const viewportY = Number(await surface.getAttribute("data-viewport-y"));
  const viewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  const [x, y, width, height] = (
    await page.getByTestId("selection-frame-geometry").innerText()
  )
    .split(",")
    .map(Number);
  const frame = {
    left: surfaceBox!.x + viewportX + x! * viewportScale,
    top: surfaceBox!.y + viewportY + y! * viewportScale,
    right: surfaceBox!.x + viewportX + (x! + width!) * viewportScale,
    bottom: surfaceBox!.y + viewportY + (y! + height!) * viewportScale,
  };
  const separated =
    toolbarBox!.y + toolbarBox!.height <= frame.top ||
    toolbarBox!.y >= frame.bottom ||
    toolbarBox!.x + toolbarBox!.width <= frame.left ||
    toolbarBox!.x >= frame.right;
  expect(separated).toBe(true);
});

test("previews child layout continuously while its parent resizes", async ({
  page,
}) => {
  await openFreshCanvas(page);
  const surface = page.getByTestId("product-canvas-surface");
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({ position: { x: 300, y: 260 } });
  const parent = page.getByRole("button", {
    name: "rectangle — Sticky note",
    exact: true,
  });
  const label = page.getByRole("button", {
    name: "Contained intrinsic label",
  });
  await label.click();
  const initialLabelWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  await parent.click();

  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
  const viewportY = Number(await surface.getAttribute("data-viewport-y"));
  const viewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  const x = Number(await page.getByTestId("selected-position-x").innerText());
  const y = Number(await page.getByTestId("selected-position-y").innerText());
  const width = Number(await page.getByTestId("selected-width").innerText());
  const height = Number(await page.getByTestId("selected-height").innerText());
  const handleX = surfaceBox!.x + viewportX + (x + width) * viewportScale;
  const handleY = surfaceBox!.y + viewportY + (y + height) * viewportScale;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 80, handleY + 40, { steps: 4 });
  await expect(
    page.getByTestId("live-descendant-preview-count"),
  ).not.toHaveText("0");
  await page.mouse.up();
  await expect(page.getByTestId("live-descendant-preview-count")).toHaveText(
    "0",
  );
  await label.click();
  expect(
    Number(await page.getByTestId("selected-width").innerText()),
  ).toBeGreaterThan(initialLabelWidth);
});
