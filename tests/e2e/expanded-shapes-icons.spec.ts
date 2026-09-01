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
  const childLayout = page.getByRole("group", { name: "Child layout" });
  await expect(
    childLayout.getByRole("button", { name: "Pin" }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  const horizontalPin = childLayout
    .getByRole("button", { name: "Pin" })
    .first();
  const horizontalCenter = childLayout
    .getByRole("button", { name: "Center" })
    .first();
  await horizontalCenter.click();
  await expect(horizontalCenter).toHaveAttribute("aria-pressed", "true");
  expect(
    await horizontalCenter.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe(
    await horizontalPin.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  );
  const childWidth = Number(
    await page.getByTestId("selected-width").innerText(),
  );
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(Math.round(parentX + (parentWidth - childWidth) / 2)),
  );
  await childLayout.getByRole("button", { name: "Center" }).nth(1).click();
  const childHeight = Number(
    await page.getByTestId("selected-height").innerText(),
  );
  await expect(page.getByTestId("selected-position-y")).toHaveText(
    String(Math.round(parentY + (parentHeight - childHeight) / 2)),
  );
  const scaleWidth = childLayout.getByRole("button", {
    name: "Scale width",
  });
  await expect(scaleWidth).toHaveAttribute("aria-pressed", "true");
  await scaleWidth.click();
  await expect(scaleWidth).toHaveAttribute("aria-pressed", "false");
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
  await surface.dblclick({ position: { x: 390, y: 380 } });
  const inlineEditor = page.getByLabel("Edit object text on canvas");
  await expect(inlineEditor).toBeFocused();
  await inlineEditor.press("Escape");
  await parentItem.click();
  await surface.click({ position: { x: 390, y: 380 } });
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
  await expect(page.getByTestId("visible-connection-anchor-count")).toHaveText(
    "0",
  );
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
