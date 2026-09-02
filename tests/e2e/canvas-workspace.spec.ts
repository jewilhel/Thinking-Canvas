import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const password = "LocalPassword1!";
const seedCanvasId = "20000000-0000-4000-8000-000000000001";

async function signIn(page: Page, email = "owner@thinking-canvas.local") {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function chooseShape(
  page: Page,
  shape: "Rectangle" | "Ellipse" | "Diamond",
) {
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByTestId("catalog-results")
    .getByRole("button", { name: `${shape} — basic shape`, exact: true })
    .click();
}

async function dispatchPointerStroke(
  page: Page,
  pointerType: "touch" | "pen",
  pointerId: number,
  pressure: number,
) {
  await page.getByTestId("product-canvas-surface").evaluate(
    (surface, input) => {
      const bounds = surface.getBoundingClientRect();
      const dispatch = (
        type: "pointerdown" | "pointermove" | "pointerup",
        x: number,
        y: number,
        buttons: number,
      ) =>
        surface.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: bounds.left + x,
            clientY: bounds.top + y,
            pointerId: input.pointerId,
            pointerType: input.pointerType,
            isPrimary: true,
            button: 0,
            buttons,
            pressure: input.pressure,
          }),
        );
      dispatch("pointerdown", 420, 350, 1);
      dispatch("pointermove", 455, 385, 1);
      dispatch("pointermove", 510, 355, 1);
      dispatch("pointerup", 540, 380, 0);
    },
    { pointerType, pointerId, pressure },
  );
}

async function dispatchTwoTouchNavigation(page: Page) {
  await page.getByTestId("product-canvas-surface").evaluate((surface) => {
    const bounds = surface.getBoundingClientRect();
    const dispatch = (
      type: "pointerdown" | "pointermove" | "pointerup",
      pointerId: number,
      x: number,
      y: number,
      buttons: number,
      isPrimary: boolean,
    ) =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + x,
          clientY: bounds.top + y,
          pointerId,
          pointerType: "touch",
          isPrimary,
          button: 0,
          buttons,
          pressure: buttons ? 0.5 : 0,
        }),
      );
    dispatch("pointerdown", 81, 300, 300, 1, true);
    dispatch("pointerdown", 82, 500, 300, 1, false);
    dispatch("pointermove", 81, 260, 315, 1, true);
    dispatch("pointermove", 82, 550, 315, 1, false);
    dispatch("pointerup", 82, 550, 315, 0, false);
    dispatch("pointerup", 81, 260, 315, 0, true);
  });
}

test("creates, reopens, restores the viewport, and survives sign-out", async ({
  page,
}) => {
  const title = `Milestone 1 canvas ${Date.now()}`;
  await signIn(page);

  await page.getByLabel("Canvas name").fill(title);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByTestId("product-canvas-surface")).toBeVisible();
  await expect(page.getByTestId("thinking-workspace")).toBeVisible();
  await expect(page.getByTestId("workspace-top-chrome")).toBeVisible();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(page.getByTestId("product-object-count")).toHaveText("0");

  const workspaceBounds = await page
    .getByTestId("thinking-workspace")
    .boundingBox();
  const viewport = page.viewportSize();
  if (!workspaceBounds || !viewport)
    throw new Error("Workspace or viewport dimensions are unavailable.");
  expect(Math.round(workspaceBounds.width)).toBe(viewport.width);
  expect(Math.round(workspaceBounds.height)).toBe(viewport.height);

  const initialScale = await page
    .getByTestId("product-canvas-scale")
    .textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("product-canvas-scale")).not.toHaveText(
    initialScale ?? "100%",
  );
  const restoredScale = await page
    .getByTestId("product-canvas-scale")
    .textContent();
  await page.reload();
  await expect(page.getByTestId("product-canvas-scale")).toHaveText(
    restoredScale ?? "108%",
  );

  await page.getByRole("link", { name: "Back to canvases" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(title) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/reason=signed-out/);

  await signIn(page);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("copies a member-safe canvas link without granting access", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const nonmemberContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const nonmember = await nonmemberContext.newPage();
  await signIn(owner);
  await owner.goto(`/app/canvases/${seedCanvasId}`);
  await owner.getByRole("button", { name: "Copy canvas link" }).click();
  await expect(owner.getByTestId("share-link-status")).toHaveText(
    "Canvas link copied. Access is still limited to members.",
  );
  const copiedLink = await owner.evaluate(() => navigator.clipboard.readText());
  expect(copiedLink).toBe(owner.url());

  await signIn(nonmember, "nonmember@thinking-canvas.local");
  await nonmember.goto(copiedLink);
  await expect(
    nonmember.getByRole("heading", { name: "This canvas cannot be opened." }),
  ).toBeVisible();
  await expect(
    nonmember.getByText("Synthetic architecture spike canvas"),
  ).not.toBeVisible();

  await ownerContext.close();
  await nonmemberContext.close();
});

test("pans the scaled grid with trackpad gestures and keeps pinch zoom controlled", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/app/canvases/${seedCanvasId}`);
  const surface = page.getByTestId("product-canvas-surface");
  const canvas = surface.locator("canvas");
  await canvas.hover({ position: { x: 420, y: 300 } });

  const viewportNumber = async (name: "x" | "y" | "scale") =>
    Number(await surface.getAttribute(`data-viewport-${name}`));
  const gridStyle = () =>
    surface.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        position: style.backgroundPosition,
        size: style.backgroundSize,
      };
    });

  const selectX = await viewportNumber("x");
  const selectY = await viewportNumber("y");
  const selectScale = await viewportNumber("scale");
  const selectGridBefore = await gridStyle();
  await canvas.dispatchEvent("wheel", {
    deltaMode: 0,
    deltaX: 32,
    deltaY: 18,
  });
  await expect(surface).toHaveAttribute(
    "data-viewport-x",
    String(selectX - 32),
  );
  await expect(surface).toHaveAttribute(
    "data-viewport-y",
    String(selectY - 18),
  );
  expect(await viewportNumber("scale")).toBe(selectScale);
  const selectGridAfter = await gridStyle();
  expect(selectGridAfter.position).not.toBe(selectGridBefore.position);
  expect(selectGridAfter.size).toBe(selectGridBefore.size);

  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const panX = await viewportNumber("x");
  const panY = await viewportNumber("y");
  const panGridBefore = await gridStyle();
  await canvas.dispatchEvent("wheel", {
    deltaMode: 0,
    deltaX: -21,
    deltaY: 14,
  });
  await expect(surface).toHaveAttribute("data-viewport-x", String(panX + 21));
  await expect(surface).toHaveAttribute("data-viewport-y", String(panY - 14));
  expect((await gridStyle()).position).not.toBe(panGridBefore.position);

  await page.waitForTimeout(180);
  const scaleBeforeWheel = await viewportNumber("scale");
  const gridBeforeWheel = await gridStyle();
  await canvas.dispatchEvent("wheel", {
    deltaMode: 0,
    deltaX: 0,
    deltaY: -120,
  });
  await expect(surface).not.toHaveAttribute(
    "data-viewport-scale",
    String(scaleBeforeWheel),
  );
  expect((await gridStyle()).size).not.toBe(gridBeforeWheel.size);

  const scaleBeforePinch = await viewportNumber("scale");
  const gridBeforePinch = await gridStyle();
  await canvas.dispatchEvent("wheel", {
    ctrlKey: true,
    deltaMode: 0,
    deltaX: 0,
    deltaY: -20,
  });
  await expect(surface).not.toHaveAttribute(
    "data-viewport-scale",
    String(scaleBeforePinch),
  );
  const scaleAfterPinch = await viewportNumber("scale");
  expect(scaleAfterPinch / scaleBeforePinch).toBeGreaterThan(1);
  expect(scaleAfterPinch / scaleBeforePinch).toBeLessThan(1.08);
  expect((await gridStyle()).size).not.toBe(gridBeforePinch.size);
});

test("offers a keyboard-operable progressive dock without mutating from deferred entries", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await page.goto(`/app/canvases/${seedCanvasId}`);

  const dock = page.getByTestId("workspace-primary-dock");
  await expect(dock).toBeVisible();
  const dockButtons = dock.getByRole("button");
  for (const button of await dockButtons.all()) {
    const bounds = await button.boundingBox();
    if (!bounds) throw new Error("A primary dock button is not rendered.");
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }

  const select = page.getByRole("button", { name: "Select", exact: true });
  const pressedTools = dock.locator('button[aria-pressed="true"]');
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(pressedTools).toHaveCount(1);
  await select.focus();
  await select.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Pan", exact: true }),
  ).toBeFocused();

  await chooseShape(page, "Ellipse");
  await expect(
    page.getByRole("button", { name: "Shapes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const shapes = page.getByRole("button", { name: "Shapes", exact: true });
  await shapes.click();
  await expect(page.getByText("Choose a shape")).toBeVisible();
  await expect(shapes).toHaveAttribute("aria-pressed", "true");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(pressedTools).toHaveCount(1);
  await shapes.click();
  await expect(page.getByText("Choose a shape")).not.toBeVisible();
  await expect(select).toHaveAttribute("aria-pressed", "true");

  for (const label of ["Pan", "Sticky note", "Connector", "Text", "Table"]) {
    const tool = page.getByRole("button", { name: label, exact: true });
    await tool.click();
    await expect(tool).toHaveAttribute("aria-pressed", "true");
    await expect(select).toHaveAttribute("aria-pressed", "false");
    await expect(pressedTools).toHaveCount(1);
    await tool.click();
    await expect(select).toHaveAttribute("aria-pressed", "true");
  }

  const baseline = await page.getByTestId("product-object-count").innerText();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Pen" })).toBeVisible();
  await expect(page.getByText("Stroke color")).toBeVisible();
  await expect(page.getByText("Stroke thickness")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Drawing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(pressedTools).toHaveCount(1);
  await expect(page.getByTestId("product-object-count")).toHaveText(baseline);
  await page
    .getByRole("button", { name: "Drawing", exact: true })
    .press("Escape");
  await expect(
    page.getByRole("button", { name: "Drawing", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(select).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Place comment on canvas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Comments" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Comments", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(pressedTools).toHaveCount(1);
  await expect(page.getByTestId("product-object-count")).toHaveText(baseline);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(select).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "More tools", exact: true }).click();
  await expect(page.getByText("The dock is ready to grow")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "More tools", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(pressedTools).toHaveCount(1);
  await expect(page.getByTestId("product-object-count")).toHaveText(baseline);
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  await expect(select).toHaveAttribute("aria-pressed", "true");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("draws mouse, touch, and pen strokes that converge and reload", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const commenterContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  const commenter = await commenterContext.newPage();
  await signIn(owner);
  await signIn(editor, "editor@thinking-canvas.local");
  await signIn(commenter, "commenter@thinking-canvas.local");
  await owner.goto(`/app/canvases/${seedCanvasId}`);
  await editor.goto(`/app/canvases/${seedCanvasId}`);
  await commenter.goto(`/app/canvases/${seedCanvasId}`);
  const surface = owner.getByTestId("product-canvas-surface");
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved");
  await commenter.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(
    commenter.getByRole("menuitemradio", { name: "Pen" }),
  ).toBeDisabled();
  await expect(
    commenter.getByText(
      "Viewers and commenters can see annotations but cannot draw.",
    ),
  ).toBeVisible();
  const baseline = Number(
    await editor.getByTestId("product-annotation-count").innerText(),
  );
  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline),
  );
  await expect(editor.getByTestId("product-annotation-count")).toHaveText(
    String(baseline),
  );
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Canvas bounds are unavailable.");

  await owner.getByRole("button", { name: "Drawing", exact: true }).click();
  await owner.getByRole("menuitemradio", { name: "Pen" }).click();
  await expect(
    owner.getByRole("button", { name: "Drawing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const scaleBeforeTouchNavigation = await owner
    .getByTestId("product-canvas-surface")
    .getAttribute("data-viewport-scale");
  await dispatchTwoTouchNavigation(owner);
  await expect(owner.getByTestId("product-canvas-surface")).not.toHaveAttribute(
    "data-viewport-scale",
    scaleBeforeTouchNavigation ?? "1",
  );
  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline),
  );

  await owner.mouse.move(bounds.x + 360, bounds.y + 260);
  await owner.mouse.down();
  await owner.mouse.move(bounds.x + 410, bounds.y + 300, { steps: 8 });
  await owner.mouse.move(bounds.x + 470, bounds.y + 270, { steps: 8 });
  await owner.mouse.up();

  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 1),
  );
  await expect(editor.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 1),
  );

  await editor.getByRole("button", { name: "Drawing", exact: true }).click();
  await editor.getByRole("menuitemradio", { name: "Pen" }).click();
  await dispatchPointerStroke(editor, "touch", 71, 0.35);
  await owner.getByRole("button", { name: "Drawing", exact: true }).click();
  await owner.getByRole("menuitemradio", { name: "Pen" }).click();
  await dispatchPointerStroke(owner, "pen", 72, 0.85);

  for (const participant of [owner, editor]) {
    await expect(
      participant.getByTestId("product-annotation-count"),
    ).toHaveText(String(baseline + 3));
    await expect(participant.getByTestId("canvas-save-status")).toHaveText(
      "Saved",
    );
    await participant.reload();
    await expect(
      participant.getByTestId("product-annotation-count"),
    ).toHaveText(String(baseline + 3));
  }

  await ownerContext.close();
  await editorContext.close();
  await commenterContext.close();
});

test("keeps drawing tools active, dismisses the palette, drag-erases whole strokes, and turns object borders off", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByLabel("Canvas name")
    .fill(`Milestone 6 drawing refinements ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  const surface = page.getByTestId("product-canvas-surface");
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Canvas bounds are unavailable.");

  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(
    page.locator(
      'button[aria-label$=" drawing color"]:not([aria-label="Custom drawing color"])',
    ),
  ).toHaveCount(10);
  await page.getByRole("menuitemradio", { name: "Highlighter" }).click();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Highlighter" }),
  ).toHaveAttribute("aria-checked", "true");
  const selectedHighlighterWeight = page.getByRole("button", {
    name: "16 pixel drawing stroke",
  });
  await expect(selectedHighlighterWeight).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(selectedHighlighterWeight).toHaveText("");
  await expect(selectedHighlighterWeight).toHaveClass(/bg-white/);
  await expect(selectedHighlighterWeight).toHaveClass(/text-zinc-950/);
  await expect(selectedHighlighterWeight).toHaveClass(
    /aria-pressed:bg-violet-50/,
  );
  await expect(
    page.getByRole("button", { name: "3 pixel drawing stroke" }),
  ).toHaveClass(/bg-white/);
  const selectedDrawingColor = page.locator(
    'button[aria-label$=" drawing color"][aria-pressed="true"]',
  );
  await expect(selectedDrawingColor.locator("svg")).toHaveCount(1);
  await expect(selectedDrawingColor.locator("svg")).toHaveClass(/text-white/);
  await page.getByLabel("Custom drawing color").click();
  await page.getByLabel("Custom drawing color hex").fill("#0d9488");
  await page.getByLabel("Custom drawing color hex").press("Enter");
  await page.getByRole("button", { name: "Close color picker" }).click();

  const drawStroke = async (y: number, startX = 260, endX = 400) => {
    await page.mouse.move(bounds.x + startX, bounds.y + y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + endX, bounds.y + y, { steps: 8 });
    await page.mouse.up();
  };

  await page.mouse.move(bounds.x + 260, bounds.y + 220);
  await page.mouse.down();
  await expect(page.getByTestId("workspace-drawing-palette")).toBeHidden();
  await page.mouse.move(bounds.x + 400, bounds.y + 220, { steps: 8 });
  await page.mouse.up();
  await drawStroke(300);
  await drawStroke(380, 460, 580);

  await expect(page.getByTestId("product-annotation-count")).toHaveText("3");
  await expect(
    page.getByRole("button", { name: "Drawing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByTestId("contextual-selection-controls"),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByTestId("contextual-selection-controls")).toBeVisible();

  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Highlighter" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Eraser" }).click();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await page.mouse.move(bounds.x + 330, bounds.y + 185);
  await page.mouse.down();
  await expect(page.getByTestId("workspace-drawing-palette")).toBeHidden();
  await page.mouse.move(bounds.x + 330, bounds.y + 335, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("product-annotation-count")).toHaveText("1");
  await expect(
    page.getByRole("button", { name: "Drawing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await surface.focus();
  await surface.press("Control+z");
  await expect(page.getByTestId("product-annotation-count")).toHaveText("3");

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByTestId("catalog-results")
    .getByRole("button", { name: "Rectangle — basic shape", exact: true })
    .click();
  await surface.click({ position: { x: 560, y: 320 } });
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.getByRole("button", { name: "Stroke", exact: true }).click();
  await page.getByRole("button", { name: "No stroke" }).click();
  await expect(page.getByTestId("selected-stroke-width")).toHaveText("0");
});

test("styles, groups, transforms, hides, and promotes selected annotations", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  const title = `Milestone 6 annotation editing ${Date.now()}`;
  await page.getByLabel("Canvas name").fill(title);
  await page.getByRole("button", { name: "Create canvas" }).click();
  const surface = page.getByTestId("product-canvas-surface");
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Canvas bounds are unavailable.");

  const drawStroke = async (points: Array<{ x: number; y: number }>) => {
    await page.getByRole("button", { name: "Drawing", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Pen" }).click();
    await page.mouse.move(bounds.x + points[0]!.x, bounds.y + points[0]!.y);
    await page.mouse.down();
    for (const point of points.slice(1)) {
      await page.mouse.move(bounds.x + point.x, bounds.y + point.y, {
        steps: 5,
      });
    }
    await page.mouse.up();
  };

  await drawStroke([
    { x: 260, y: 260 },
    { x: 300, y: 290 },
    { x: 340, y: 265 },
  ]);
  await expect(page.getByTestId("product-annotation-count")).toHaveText("1");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Stroke", exact: true }).click();
  await page.getByRole("button", { name: "8 pixel stroke" }).click();
  await expect(page.getByText("Style", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Stroke", exact: true }).click();

  await drawStroke([
    { x: 470, y: 350 },
    { x: 510, y: 380 },
    { x: 550, y: 350 },
  ]);
  await expect(page.getByTestId("product-annotation-count")).toHaveText("2");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await surface.click({ position: { x: 300, y: 280 }, modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  const frameBefore = await page
    .getByTestId("product-selection-frame")
    .innerText();
  const [frameX, frameY, frameWidth, frameHeight] = frameBefore
    .split(",")
    .map(Number);

  await page.getByRole("button", { name: "Stroke", exact: true }).click();
  await expect(page.getByText("Thickness — Mixed")).toBeVisible();
  await page.getByRole("button", { name: "5 pixel stroke" }).click();
  await expect(page.getByText("Style", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Stroke", exact: true }).click();

  await page.mouse.move(
    bounds.x + 80 + frameX + frameWidth / 2,
    bounds.y + 80 + frameY + frameHeight / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + 120 + frameX + frameWidth / 2,
    bounds.y + 105 + frameY + frameHeight / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.getByTestId("product-selection-frame")).toHaveText(
    `${frameX + 40},${frameY + 25},${frameWidth},${frameHeight}`,
  );
  await surface.focus();
  await surface.press("Control+z");
  await expect(page.getByTestId("product-selection-frame")).toHaveText(
    frameBefore,
  );

  await page
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  await page
    .getByRole("button", { name: "Hide comments and annotations" })
    .click();
  await expect(page.getByTestId("product-annotation-count")).toHaveText("2");
  await expect(page.getByTestId("product-visible-annotation-count")).toHaveText(
    "0",
  );
  await page
    .getByRole("button", { name: "Show comments and annotations" })
    .click();
  await page.getByRole("button", { name: "Close Comments" }).click();

  await surface.click({ position: { x: 300, y: 280 } });
  await surface.click({ position: { x: 510, y: 370 }, modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "More selection actions", exact: true })
    .click();
  await page.getByRole("button", { name: "Promote annotation" }).click();
  await page
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  await page
    .getByRole("button", { name: "Hide comments and annotations" })
    .click();
  await expect(page.getByTestId("product-visible-annotation-count")).toHaveText(
    "2",
  );

  await page.reload();
  await expect(page.getByTestId("product-annotation-count")).toHaveText("2");
  await expect(page.getByTestId("product-visible-annotation-count")).toHaveText(
    "2",
  );

  await page.getByRole("button", { name: "Open Object navigator" }).click();
  const items = page.locator('[data-testid^="object-list-item-"]');
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Close Object navigator" }).click();
  await surface.focus();
  await surface.press("Control+d");
  await expect(page.getByTestId("product-annotation-count")).toHaveText("4");
  await surface.press("Delete");
  await expect(page.getByTestId("product-annotation-count")).toHaveText("2");
  await surface.press("Control+z");
  await expect(page.getByTestId("product-annotation-count")).toHaveText("4");
  await surface.press("Control+Shift+z");
  await expect(page.getByTestId("product-annotation-count")).toHaveText("2");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("converges edited and promoted ink while visibility stays per-user", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner);
  await signIn(editor, "editor@thinking-canvas.local");
  await owner.goto(`/app/canvases/${seedCanvasId}`);
  await editor.goto(`/app/canvases/${seedCanvasId}`);
  const ownerSurface = owner.getByTestId("product-canvas-surface");
  const bounds = await ownerSurface.boundingBox();
  if (!bounds) throw new Error("Canvas bounds are unavailable.");
  await expect(owner.getByTestId("product-object-count")).not.toHaveText("0");
  await expect(editor.getByTestId("product-object-count")).not.toHaveText("0");
  const baseline = Number(
    await editor.getByTestId("product-annotation-count").innerText(),
  );
  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline),
  );

  const draw = async (offset: number) => {
    await owner.getByRole("button", { name: "Drawing", exact: true }).click();
    await owner.getByRole("menuitemradio", { name: "Pen" }).click();
    await owner.mouse.move(bounds.x + 700, bounds.y + 250 + offset);
    await owner.mouse.down();
    await owner.mouse.move(bounds.x + 750, bounds.y + 285 + offset, {
      steps: 6,
    });
    await owner.mouse.move(bounds.x + 800, bounds.y + 255 + offset, {
      steps: 6,
    });
    await owner.mouse.up();
    await owner.getByRole("button", { name: "Select", exact: true }).click();
  };

  await draw(0);
  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 1),
  );
  await expect(editor.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 1),
  );
  await owner.getByRole("button", { name: "Stroke", exact: true }).click();
  await owner.getByRole("button", { name: "8 pixel stroke" }).click();
  await owner.getByRole("button", { name: "Stroke", exact: true }).click();
  await owner
    .getByRole("button", { name: "More selection actions", exact: true })
    .click();
  await owner.getByRole("button", { name: "Promote annotation" }).click();
  await owner.getByRole("button", { name: "Drawing", exact: true }).click();
  await owner.getByRole("menuitemradio", { name: "Pen" }).click();
  await dispatchPointerStroke(owner, "pen", 93, 0.6);
  await owner.getByRole("button", { name: "Select", exact: true }).click();

  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 2),
  );

  await expect(editor.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 2),
  );
  await editor.getByRole("button", { name: "Open Object navigator" }).click();
  const editorItems = editor.locator('[data-testid^="object-list-item-"]');
  const itemCount = await editorItems.count();
  await editorItems.nth(itemCount - 2).click();
  await expect(editor.getByTestId("selected-stroke-width")).toHaveText("8");
  await expect(editor.getByTestId("selected-annotation-temporary")).toHaveText(
    "false",
  );
  await editorItems.nth(itemCount - 1).click();
  await expect(editor.getByTestId("selected-annotation-temporary")).toHaveText(
    "true",
  );

  const editorVisible = await editor
    .getByTestId("product-visible-annotation-count")
    .innerText();
  await owner
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  await owner
    .getByRole("button", { name: "Hide comments and annotations" })
    .click();
  await expect
    .poll(async () =>
      Number(
        await owner.getByTestId("product-visible-annotation-count").innerText(),
      ),
    )
    .toBeLessThan(Number(editorVisible));
  expect(
    Number(
      await owner.getByTestId("product-visible-annotation-count").innerText(),
    ),
  ).toBeGreaterThan(0);
  await expect(
    editor.getByTestId("product-visible-annotation-count"),
  ).toHaveText(editorVisible);
  await expect(owner.getByTestId("product-annotation-count")).toHaveText(
    String(baseline + 2),
  );

  await ownerContext.close();
  await editorContext.close();
});

test("attaches overlapping ink, follows movement, disconnects, and detaches on delete", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByLabel("Canvas name")
    .fill(`Milestone 6 attachment ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  const surface = page.getByTestId("product-canvas-surface");
  await chooseShape(page, "Rectangle");
  await surface.click({ position: { x: 300, y: 280 } });
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Canvas bounds are unavailable.");

  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Pen" }).click();
  await page.mouse.move(bounds.x + 280, bounds.y + 330);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 360, bounds.y + 345, { steps: 8 });
  await page.mouse.move(bounds.x + 430, bounds.y + 325, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(page.getByTestId("selected-annotation-attached")).toHaveText(
    "true",
  );
  const initialX = Number(
    await page.getByTestId("selected-position-x").innerText(),
  );

  await surface.focus();
  await surface.press("Shift+ArrowRight");
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(initialX + 10),
  );
  await expect(page.getByTestId("selected-annotation-attached")).toHaveText(
    "true",
  );

  const selectNavigatorItem = async (index: number) => {
    if (
      !(await page
        .getByRole("dialog", { name: "Object navigator" })
        .isVisible())
    ) {
      await page.getByRole("button", { name: "Open Object navigator" }).click();
    }
    await page
      .locator('[data-testid^="object-list-item-"]:not([data-parent-id])')
      .nth(index)
      .click();
  };
  await selectNavigatorItem(0);
  await surface.focus();
  await surface.press("Shift+ArrowRight");
  await selectNavigatorItem(1);
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(initialX + 20),
  );

  const attachedX = Number(
    await page.getByTestId("selected-position-x").innerText(),
  );
  await page
    .getByRole("button", { name: "More selection actions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnect annotation", exact: true })
    .click();
  await expect(page.getByTestId("selected-annotation-attached")).toHaveText(
    "false",
  );
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(attachedX),
  );

  await selectNavigatorItem(0);
  await surface.focus();
  await surface.press("Shift+ArrowRight");
  await selectNavigatorItem(1);
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(attachedX),
  );

  await surface.focus();
  await surface.press("Control+z");
  await surface.press("Control+z");
  await expect(page.getByTestId("selected-annotation-attached")).toHaveText(
    "true",
  );
  const beforeDeleteX = await page
    .getByTestId("selected-position-x")
    .innerText();
  await selectNavigatorItem(0);
  await surface.focus();
  await surface.press("Delete");
  await expect(page.getByTestId("product-object-count")).toHaveText("1");
  await selectNavigatorItem(0);
  await expect(page.getByTestId("selected-annotation-attached")).toHaveText(
    "false",
  );
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    beforeDeleteX,
  );
  await page.reload();
  await expect(page.getByTestId("product-object-count")).toHaveText("1");
});

test("uses dismissible responsive panels with focus containment, help, and true zoom-to-fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await page.goto(`/app/canvases/${seedCanvasId}`);

  const objectInvoker = page.getByRole("button", {
    name: "Open Object navigator",
  });
  await objectInvoker.click();
  const objectPanel = page.getByRole("dialog", { name: "Object navigator" });
  await expect(objectPanel).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close Object navigator" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(objectPanel.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(objectPanel).not.toBeVisible();
  await expect(objectInvoker).toBeFocused();

  const commentsInvoker = page.getByRole("button", {
    name: "Open comment history and AI settings",
  });
  const pendingCountBeforeComments = await page
    .getByTestId("product-pending-count")
    .innerText();
  await commentsInvoker.click();
  const commentsPanel = page.getByRole("dialog", { name: "Comments" });
  await expect(commentsPanel).toContainText(
    "Attach feedback to a selection, an object, or anywhere on the canvas.",
  );
  await expect(commentsPanel).not.toContainText(
    "Click an object or anywhere on the canvas to add a comment.",
  );
  await expect(page.getByTestId("product-pending-count")).toHaveText(
    pendingCountBeforeComments,
  );
  const commentsAccessibility = await new AxeBuilder({ page }).analyze();
  expect(commentsAccessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Close Comments" }).click();
  await expect(commentsPanel).not.toBeVisible();
  await expect(commentsInvoker).toBeFocused();

  const helpInvoker = page.getByRole("button", { name: "Open canvas help" });
  await helpInvoker.click();
  const helpPanel = page.getByRole("dialog", { name: "Canvas help" });
  await expect(helpPanel).toContainText("Mod+Z / Mod+Shift+Z");
  const helpAccessibility = await new AxeBuilder({ page }).analyze();
  expect(helpAccessibility.violations).toEqual([]);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    for (const chrome of [
      helpPanel,
      page.getByTestId("workspace-primary-dock"),
      page.getByRole("button", { name: "Zoom to fit" }),
    ]) {
      const bounds = await chrome.boundingBox();
      if (!bounds) throw new Error("Responsive workspace chrome is missing.");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
  }

  await page.setViewportSize({ width: 768, height: 520 });
  const panelBounds = await helpPanel.boundingBox();
  if (!panelBounds) throw new Error("The responsive panel is not rendered.");
  expect(panelBounds.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds.y).toBeGreaterThanOrEqual(0);
  expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(768);
  expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(520);
  const closeBounds = await page
    .getByRole("button", { name: "Close Canvas help" })
    .boundingBox();
  if (!closeBounds) throw new Error("The panel close action is not rendered.");
  expect(closeBounds.width).toBeGreaterThanOrEqual(44);
  expect(closeBounds.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");

  const beforeFit = await page.getByTestId("product-canvas-scale").innerText();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("product-canvas-scale")).not.toHaveText(
    beforeFit,
  );
  const zoomed = await page.getByTestId("product-canvas-scale").innerText();
  await page.getByRole("button", { name: "Zoom to fit" }).click();
  await expect(page.getByTestId("product-canvas-scale")).not.toHaveText(zoomed);
});

test("queues edits through a temporary disconnect, protects navigation, and converges after reconnect", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const title = `Recovery canvas ${Date.now()}`;
  await signIn(owner);
  await owner.getByLabel("Canvas name").fill(title);
  await owner.getByRole("button", { name: "Create canvas" }).click();
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");

  await ownerContext.setOffline(true);
  await chooseShape(owner, "Rectangle");
  await owner.getByTestId("product-canvas-surface").click({
    position: { x: 240, y: 180 },
  });
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Unsynced");
  await expect(owner.getByTestId("product-pending-count")).toHaveText("1");

  owner.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Changes are still waiting to sync");
    await dialog.dismiss();
  });
  await owner.getByRole("link", { name: "Back to canvases" }).click();
  await expect(owner).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);

  await ownerContext.setOffline(false);
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(owner.getByTestId("product-pending-count")).toHaveText("0");
  await owner.reload();
  await expect(owner.getByTestId("product-object-count")).toHaveText("1");

  await ownerContext.close();
});

test("two product canvases converge after concurrent work and a disconnected edit", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner);
  await signIn(editor, "editor@thinking-canvas.local");
  await Promise.all([
    owner.goto(`/app/canvases/${seedCanvasId}`),
    editor.goto(`/app/canvases/${seedCanvasId}`),
  ]);
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect
    .poll(async () =>
      Number(
        await owner.getByTestId("product-participant-count").textContent(),
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () =>
      Number(
        await editor.getByTestId("product-participant-count").textContent(),
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await Promise.all(
    [owner, editor].map(async (page) => {
      const comments = page.getByRole("button", {
        name: "Open comment history and AI settings",
      });
      await comments.click();
      const hideMarkers = page.getByRole("button", {
        name: "Hide comments and annotations",
      });
      if (await hideMarkers.isVisible()) await hideMarkers.click();
      await page.getByRole("button", { name: "Close Comments" }).click();
      await expect(
        page.getByRole("button", { name: "Place comment on canvas" }),
      ).not.toBeVisible();
    }),
  );
  const ownerSurface = owner.getByTestId("product-canvas-surface");
  const ownerBounds = await ownerSurface.boundingBox();
  if (!ownerBounds) throw new Error("Owner canvas bounds are unavailable.");
  await ownerSurface.dispatchEvent("pointermove", {
    clientX: ownerBounds.x + 320,
    clientY: ownerBounds.y + 220,
    pointerType: "mouse",
  });
  await expect(owner.getByTestId("product-cursor-publish-count")).toHaveText(
    /[1-9]\d*\/[1-9]\d* · sent/,
  );
  await expect(editor.getByTestId("product-remote-cursor-count")).toHaveText(
    "1",
  );

  const baseline = Number(
    await owner.getByTestId("product-object-count").textContent(),
  );
  await Promise.all([
    chooseShape(owner, "Rectangle"),
    chooseShape(editor, "Ellipse"),
  ]);
  await Promise.all([
    owner
      .getByTestId("product-canvas-surface")
      .click({ position: { x: 80, y: 500 } }),
    editor
      .getByTestId("product-canvas-surface")
      .click({ position: { x: 850, y: 500 } }),
  ]);
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 2),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 2),
  );

  await editorContext.setOffline(true);
  await chooseShape(editor, "Diamond");
  await editor
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 700, y: 360 } });
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Unsynced");
  await owner.getByRole("button", { name: "Sticky note", exact: true }).click();
  await owner
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 360, y: 420 } });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 3),
  );

  await editorContext.setOffline(false);
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 4),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 4),
  );
  await owner.getByRole("button", { name: "More tools", exact: true }).click();
  await owner.getByRole("button", { name: "Add simulated AI idea" }).click();
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );
  await Promise.all([
    owner.getByRole("button", { name: "Open Object navigator" }).click(),
    editor.getByRole("button", { name: "Open Object navigator" }).click(),
  ]);
  await expect(
    owner.getByRole("button", { name: /rectangle — Sticky note/ }).last(),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: /rectangle — Sticky note/ }).last(),
  ).toBeVisible();
  await Promise.all([owner.reload(), editor.reload()]);
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );

  await editorContext.close();
  await ownerContext.close();
});

test("does not disclose a canvas to a non-member", async ({ page }) => {
  await signIn(page, "nonmember@thinking-canvas.local");
  await page.goto(`/app/canvases/${seedCanvasId}`);

  await expect(
    page.getByRole("heading", { name: "This canvas cannot be opened." }),
  ).toBeVisible();
  await expect(
    page.getByText("It may no longer exist, or it may not be shared"),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic architecture spike canvas"),
  ).not.toBeVisible();
});

test("rejects a malformed canvas route without querying disclosed content", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/app/canvases/not-a-uuid");

  await expect(
    page.getByRole("heading", { name: "This canvas cannot be opened." }),
  ).toBeVisible();
});
