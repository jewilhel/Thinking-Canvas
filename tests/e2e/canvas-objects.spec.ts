import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const password = "LocalPassword1!";

async function ensureObjectNavigator(page: Page) {
  if (
    !(await page.getByRole("dialog", { name: "Object navigator" }).isVisible())
  ) {
    await page.getByRole("button", { name: "Open Object navigator" }).click();
  }
}

async function openFreshCanvas(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("owner@thinking-canvas.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByLabel("Canvas name").fill(`Object matrix ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  await ensureObjectNavigator(page);
  return page.getByTestId("product-canvas-surface");
}

async function createAt(
  page: Page,
  tool: "Rectangle" | "Ellipse" | "Diamond" | "Text" | "Table",
  position: { x: number; y: number },
) {
  if (["Rectangle", "Ellipse", "Diamond"].includes(tool)) {
    await page.getByRole("button", { name: "Shapes", exact: true }).click();
    await page.getByRole("menuitemradio", { name: tool, exact: true }).click();
  } else {
    await page.getByRole("button", { name: tool, exact: true }).click();
  }
  await page.getByTestId("product-canvas-surface").click({ position });
  await expect(page.getByTestId("canvas-inspector-selection")).toBeVisible();
}

async function selectedNumber(page: Page, testId: string) {
  return Number(await page.getByTestId(testId).innerText());
}

async function clearCanvas(page: Page) {
  const objects = page.locator('[data-testid^="object-list-item-"]');
  while ((await objects.count()) > 0) {
    await objects.first().click();
    await deleteSelection(page);
  }
}

async function openContextPanel(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function deleteSelection(page: Page) {
  await openContextPanel(page, "More selection actions");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
}

async function setFill(page: Page, value: string) {
  await openContextPanel(page, "Fill");
  await setCustomColor(page, "Custom fill color", value);
}

async function setCustomColor(page: Page, label: string, value: string) {
  await page.getByLabel(label).click();
  const input = page.getByLabel(`${label} hex`);
  await input.fill(value);
  await input.press("Enter");
  await page.getByRole("button", { name: "Close color picker" }).click();
}

async function createLabeledShape(
  page: Page,
  tool: "Rectangle" | "Ellipse" | "Diamond",
  label: string,
  position: { x: number; y: number },
) {
  await createAt(page, tool, position);
  await editSelectedText(page, label);
}

async function editSelectedText(page: Page, text: string) {
  await openInlineEditorForSelection(page);
  const editor = page.getByLabel("Edit object text on canvas");
  await editor.fill(text);
  await editor.press("Control+Enter");
  await expect(editor).not.toBeVisible();
}

async function openInlineEditorForSelection(page: Page) {
  const [x, y, width, height] = await Promise.all([
    selectedNumber(page, "selected-position-x"),
    selectedNumber(page, "selected-position-y"),
    selectedNumber(page, "selected-width"),
    selectedNumber(page, "selected-height"),
  ]);
  await page.getByTestId("product-canvas-surface").dblclick({
    position: { x: 80 + x + width / 4, y: 80 + y + height / 4 },
  });
}

async function connectLabels(
  page: Page,
  source: string,
  target: string,
  startAnchor = "right",
  targetAnchor = "left",
) {
  await page.getByRole("button", { name: new RegExp(source) }).click();
  await openContextPanel(page, "Connector controls");
  await page
    .getByRole("button", { name: `Start ${startAnchor}`, exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(target) }).click();
  await openContextPanel(page, "Connector controls");
  await page
    .getByRole("button", { name: `Attach ${targetAnchor}`, exact: true })
    .click();
}

async function retainArrangement(
  surface: Locator,
  testInfo: TestInfo,
  name: string,
) {
  const body = await surface.screenshot();
  await testInfo.attach(name, { body, contentType: "image/png" });
  if (process.env.RETAIN_CANVAS_EVIDENCE !== "1") return;
  const directory = path.join(
    process.cwd(),
    "docs/implementation/evidence/milestone-01",
  );
  await mkdir(directory, { recursive: true });
  await surface.screenshot({
    path: path.join(directory, `slice-02-${name}.png`),
  });
}

test("creates, selects, moves, resizes, styles, edits, persists, and deletes essential objects", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);

  await createAt(page, "Rectangle", { x: 180, y: 140 });
  await editSelectedText(page, "Styled planning idea");
  await setFill(page, "#fef3c7");
  await openContextPanel(page, "Stroke");
  const solidStrokeStyle = page.getByRole("button", {
    name: "solid",
    exact: true,
  });
  await expect(solidStrokeStyle).toHaveAttribute("aria-pressed", "true");
  await expect(solidStrokeStyle).toHaveClass(/bg-violet-500/);
  await expect(solidStrokeStyle.locator("svg")).toHaveCount(1);
  await setCustomColor(page, "Custom stroke color", "#d97706");
  await page.getByRole("button", { name: "5 pixel stroke" }).click();
  const dashedStrokeStyle = page.getByRole("button", {
    name: "dashed",
    exact: true,
  });
  await dashedStrokeStyle.click();
  await expect(dashedStrokeStyle).toHaveAttribute("aria-pressed", "true");
  await expect(dashedStrokeStyle).toHaveClass(/bg-violet-500/);
  await expect(dashedStrokeStyle.locator("svg")).toHaveCount(1);
  await expect(solidStrokeStyle.locator("svg")).toHaveCount(0);
  await expect(page.getByTestId("selected-stroke-pattern")).toHaveText(
    "dashed",
  );
  await openContextPanel(page, "Text style");
  await page.getByLabel("Typeface").selectOption({ label: "Bookish" });
  await page.getByLabel("Custom text size").fill("22");
  await page.getByLabel("Custom text size").press("Enter");
  await page.getByRole("button", { name: "Text style", exact: true }).click();

  const xBeforeKeyboard = await selectedNumber(page, "selected-position-x");
  const widthBeforeKeyboard = await selectedNumber(page, "selected-width");
  await surface.focus();
  await surface.press("Shift+ArrowRight");
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(xBeforeKeyboard + 10),
  );
  await surface.press("Alt+ArrowRight");
  await expect(page.getByTestId("selected-width")).toHaveText(
    String(widthBeforeKeyboard + 1),
  );

  const xBeforePointer = await selectedNumber(page, "selected-position-x");
  const yBeforePointer = await selectedNumber(page, "selected-position-y");
  const box = await surface.boundingBox();
  if (!box) throw new Error("Canvas surface bounds are unavailable.");
  const pointerStart = {
    x: box.x + 80 + xBeforePointer + (widthBeforeKeyboard + 1) / 4,
    y: box.y + 80 + yBeforePointer + 30,
  };
  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await page.mouse.move(pointerStart.x + 36, pointerStart.y + 24, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(xBeforePointer + 36),
  );
  await expect(page.getByTestId("selected-position-y")).toHaveText(
    String(yBeforePointer + 24),
  );
  await createAt(page, "Text", { x: 420, y: 120 });
  await expect(page.getByLabel("Custom fill color")).not.toBeVisible();
  await expect(page.getByLabel("Custom stroke color")).not.toBeVisible();
  await editSelectedText(page, "A text primitive");
  await surface.click({ position: { x: 300, y: 500 } });
  await expect(
    page.getByTestId("canvas-inspector-selection"),
  ).not.toBeVisible();
  await surface.click({ position: { x: 430, y: 156 } });
  await expect(
    page.getByRole("button", { name: /A text primitive/ }),
  ).toBeVisible();
  await surface.focus();
  await surface.press("ArrowDown");
  await surface.press("Alt+ArrowDown");

  await createAt(page, "Table", { x: 360, y: 330 });
  await openContextPanel(page, "Edit table");
  await page.getByLabel("Table cells").fill("Owner\tAction\nJason\tReview");
  await surface.focus();
  await surface.press("ArrowLeft");
  await surface.press("Alt+ArrowUp");

  await createAt(page, "Ellipse", { x: 680, y: 140 });
  await createAt(page, "Diamond", { x: 680, y: 360 });
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
  await expect(
    page.getByRole("button", { name: /Styled planning idea/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /A text primitive/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /table — 2 rows/ }),
  ).toBeVisible();

  await page.reload();
  await ensureObjectNavigator(page);
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
  await page.getByRole("button", { name: /Styled planning idea/ }).click();
  await openContextPanel(page, "Fill");
  await page.getByLabel("Custom fill color").click();
  await expect(page.getByLabel("Custom fill color hex")).toHaveValue("#FEF3C7");
  await page.getByRole("button", { name: "Close color picker" }).click();
  await openContextPanel(page, "Stroke");
  await page.getByLabel("Custom stroke color").click();
  await expect(page.getByLabel("Custom stroke color hex")).toHaveValue(
    "#D97706",
  );
  await page.getByRole("button", { name: "Close color picker" }).click();
  await expect(
    page.getByRole("button", { name: "5 pixel stroke" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "dashed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await openContextPanel(page, "Text style");
  await expect(page.getByLabel("Typeface")).toHaveValue(
    "Georgia, ui-serif, serif",
  );
  await expect(page.getByLabel("Custom text size")).toHaveValue("22");

  for (const label of [
    /Styled planning idea/,
    /A text primitive/,
    /table — 2 rows/,
    /ellipse/,
    /diamond/,
  ]) {
    await page.getByRole("button", { name: label }).click();
    await deleteSelection(page);
  }
  await expect(page.getByTestId("product-object-count")).toHaveText("0");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("edits shape, sticky-note, and text content inline with commit and cancel behavior", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);

  await createAt(page, "Rectangle", { x: 180, y: 140 });
  await surface.dblclick({ position: { x: 230, y: 180 } });
  const editor = page.getByLabel("Edit object text on canvas");
  await expect(editor).toBeFocused();
  await editor.fill("Inline shape text");
  await editor.press("Control+Enter");
  await expect(
    page.getByRole("button", { name: /Inline shape text/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await surface.click({ position: { x: 430, y: 330 } });
  await surface.dblclick({ position: { x: 480, y: 380 } });
  await editor.fill("Inline sticky text");
  await editor.press("Control+Enter");
  await expect(
    page.getByRole("button", { name: /Inline sticky text/ }),
  ).toBeVisible();

  await createAt(page, "Text", { x: 700, y: 180 });
  await surface.dblclick({ position: { x: 740, y: 205 } });
  await editor.fill("Inline free text");
  await editor.press("Escape");
  await expect(editor).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /text — New text/ }),
  ).toBeVisible();
});

test("clamps contextual controls, exposes mixed values, and restores focus on Escape", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);
  await createLabeledShape(page, "Rectangle", "Context alpha", {
    x: 120,
    y: 200,
  });
  await setFill(page, "#fee2e2");
  await createLabeledShape(page, "Rectangle", "Context beta", {
    x: 360,
    y: 320,
  });

  await page.getByRole("button", { name: /Context alpha/ }).click();
  await page
    .getByRole("button", { name: /Context beta/ })
    .click({ modifiers: ["Shift"] });
  const toolbar = page.getByTestId("contextual-selection-controls");
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  const [surfaceBox, toolbarBox] = await Promise.all([
    surface.boundingBox(),
    toolbar.boundingBox(),
  ]);
  if (!surfaceBox || !toolbarBox) throw new Error("Canvas bounds unavailable.");
  expect(toolbarBox.x).toBeGreaterThanOrEqual(surfaceBox.x);
  expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(
    surfaceBox.x + surfaceBox.width,
  );
  expect(toolbarBox.y).toBeGreaterThanOrEqual(surfaceBox.y);

  const [fillBox, strokeBox, textBox] = await Promise.all([
    page.getByRole("button", { name: "Fill", exact: true }).boundingBox(),
    page.getByRole("button", { name: "Stroke", exact: true }).boundingBox(),
    page.getByRole("button", { name: "Text style", exact: true }).boundingBox(),
  ]);
  if (!fillBox || !strokeBox || !textBox)
    throw new Error("Contextual style controls are unavailable.");
  expect(fillBox.x).toBeLessThan(strokeBox.x);
  expect(strokeBox.x).toBeLessThan(textBox.x);

  const fillTrigger = page.getByRole("button", { name: "Fill", exact: true });
  await fillTrigger.click();
  await expect(page.getByLabel("Custom fill color")).toHaveAttribute(
    "data-mixed",
    "true",
  );
  const customFillColor = page.getByLabel("Custom fill color");
  await expect(customFillColor.locator("img")).toHaveCount(0);
  await expect(customFillColor.locator('span[aria-hidden="true"]')).toHaveCSS(
    "background-image",
    /conic-gradient/,
  );
  await customFillColor.click();
  await expect(
    page.getByRole("dialog", { name: "Custom fill color picker" }),
  ).toBeVisible();
  await expect(page.getByRole("slider", { name: "Hue" })).toHaveAttribute(
    "aria-valuenow",
  );
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await expect(
    page.getByRole("slider", { name: "Saturation and brightness" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Custom fill color picker" }),
  ).not.toBeVisible();
  await expect(page.getByLabel("Custom fill color")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "fill selection controls" }),
  ).not.toBeVisible();
  await expect(fillTrigger).toBeFocused();

  await fillTrigger.click();
  await page.getByRole("button", { name: "Light blue fill" }).click();
  await page.getByLabel("Custom fill color").click();
  await expect(page.getByLabel("Custom fill color hex")).toHaveValue("#DBEAFE");
  await page.getByRole("button", { name: "Close color picker" }).click();
  await expect(page.getByLabel("Custom stroke color")).not.toBeVisible();
  await openContextPanel(page, "Stroke");
  await page.getByLabel("Custom stroke color").click();
  await expect(page.getByLabel("Custom stroke color hex")).toHaveValue(
    "#2563EB",
  );
  await page.getByRole("button", { name: "Close color picker" }).click();
  await setCustomColor(page, "Custom stroke color", "#1d4ed8");
  await page.getByRole("button", { name: /Context alpha/ }).click();
  await openContextPanel(page, "Fill");
  await page.getByLabel("Custom fill color").click();
  await expect(page.getByLabel("Custom fill color hex")).toHaveValue("#DBEAFE");
  await page.getByRole("button", { name: "Close color picker" }).click();
  await openContextPanel(page, "Stroke");
  await page.getByLabel("Custom stroke color").click();
  await expect(page.getByLabel("Custom stroke color hex")).toHaveValue(
    "#1D4ED8",
  );
  await page.getByRole("button", { name: "Close color picker" }).click();
  await expect(page.getByTestId("current-fill-swatch")).toHaveCSS(
    "background-color",
    "rgb(219, 234, 254)",
  );
  await expect(page.getByTestId("current-outline-swatch")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("uses dark contextual controls and opens selection actions from right-click, Control-click, and keyboard", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);
  await createLabeledShape(page, "Rectangle", "Menu alpha", {
    x: 180,
    y: 140,
  });
  await createLabeledShape(page, "Rectangle", "Menu beta", {
    x: 520,
    y: 140,
  });

  await page.getByRole("button", { name: /Menu alpha/ }).click();
  await page
    .getByRole("button", { name: /Menu beta/ })
    .click({ modifiers: ["Shift"] });
  const contextualToolbar = page.getByTestId("contextual-selection-controls");
  await expect(contextualToolbar.getByRole("toolbar")).toHaveClass(
    /bg-zinc-900/,
  );
  await openContextPanel(page, "Fill");
  await expect(
    page.getByRole("dialog", { name: "fill selection controls" }),
  ).toHaveClass(/bg-zinc-900/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Close Object navigator" }).click();

  const menu = page.getByRole("menu", { name: "Selection actions" });
  await surface.focus();
  await surface.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await surface.dispatchEvent("contextmenu", {
    clientX: 230,
    clientY: 170,
    bubbles: true,
    cancelable: true,
  });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Group/ })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: /Ungroup/ })).toBeDisabled();
  await menu.getByRole("menuitem", { name: /Group/ }).click();

  await surface.dispatchEvent("contextmenu", {
    clientX: 230,
    clientY: 170,
    bubbles: true,
    cancelable: true,
  });
  await expect(menu.getByRole("menuitem", { name: /Ungroup/ })).toBeEnabled();
  await menu.getByRole("menuitem", { name: /Ungroup/ }).click();

  await surface.click({ position: { x: 320, y: 500 } });
  await surface.click({
    position: { x: 230, y: 170 },
    modifiers: ["Control"],
  });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Bring to front" }).click();
  await ensureObjectNavigator(page);
  await expect(
    page.locator('[data-testid^="object-list-item-"]').last(),
  ).toContainText("Menu alpha");

  await surface.focus();
  await surface.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Bring to front" }),
  ).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(surface).toBeFocused();
});

test("styles canvas text with type, size, weight, alignment, lists, and a safe link", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await createAt(page, "Text", { x: 300, y: 180 });
  await editSelectedText(page, "First\nSecond");

  await openContextPanel(page, "Text style");
  const panel = page.getByTestId("text-style-panel");
  await expect(panel).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit text on canvas" }),
  ).not.toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveClass(/sr-only/);
  await page.getByLabel("Typeface").selectOption({ label: "Scribbled" });
  await page.getByLabel("Text size preset").selectOption({ label: "Large" });
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Align right" }).click();
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await setCustomColor(page, "Custom text color", "#7c3aed");
  await page.getByLabel("Text link URL").fill("example.com/notes");
  await page.getByRole("button", { name: "Apply link" }).click();

  await expect(page.getByLabel("Typeface")).toHaveValue(
    '"Bradley Hand", "Comic Sans MS", cursive',
  );
  await expect(page.getByLabel("Text size preset")).toHaveValue("40");
  await expect(
    page.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Align right" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Bulleted list" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Text link URL")).toHaveValue(
    "https://example.com/notes",
  );
  await page.getByLabel("Custom text color").click();
  await expect(page.getByLabel("Custom text color hex")).toHaveValue("#7C3AED");
  await page.getByRole("button", { name: "Close color picker" }).click();
  await expect(
    page.getByRole("button", { name: "Open text link" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Text style", exact: true }).click();
  await openInlineEditorForSelection(page);
  const editor = page.getByLabel("Edit object text on canvas");
  await editor.fill("1. First\nSecond");
  await editor.press("Control+Enter");

  await openContextPanel(page, "Text style");
  await expect(
    page.getByRole("button", { name: "Numbered list" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Custom text size").fill("33");
  await page.getByLabel("Custom text size").press("Enter");
  await expect(page.getByLabel("Custom text size")).toHaveValue("33");

  const violations = await new AxeBuilder({ page })
    .include('[data-testid="text-style-panel"]')
    .analyze();
  expect(violations.violations).toEqual([]);

  await page.reload();
  await ensureObjectNavigator(page);
  await page.getByRole("button", { name: /First/ }).click();
  await openContextPanel(page, "Text style");
  await expect(page.getByLabel("Custom text size")).toHaveValue("33");
  await expect(
    page.getByRole("button", { name: "Numbered list" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Text link URL")).toHaveValue(
    "https://example.com/notes",
  );
  await page.getByLabel("Custom text color").click();
  await expect(page.getByLabel("Custom text color hex")).toHaveValue("#7C3AED");
  await page.getByRole("button", { name: "Close color picker" }).click();
});

test("creates, reattaches, and detaches connectors with direct pointer gestures", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);
  await createAt(page, "Rectangle", { x: 180, y: 180 });
  await editSelectedText(page, "Drag source");
  await createAt(page, "Rectangle", { x: 520, y: 180 });
  await editSelectedText(page, "Drag target");
  await page.getByRole("button", { name: /Drag source/ }).click();

  const box = await surface.boundingBox();
  if (!box) throw new Error("Canvas surface bounds are unavailable.");
  const sourceRightHandle = { x: box.x + 388, y: box.y + 235 };
  const targetLeftHandle = { x: box.x + 492, y: box.y + 235 };
  await surface.click({ position: { x: 40, y: 400 } });
  await page.mouse.move(box.x + 350, box.y + 235);
  await page.mouse.move(sourceRightHandle.x, sourceRightHandle.y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.move(targetLeftHandle.x, targetLeftHandle.y, { steps: 8 });
  await page.mouse.up();

  await ensureObjectNavigator(page);
  await expect(page.getByTestId("product-object-count")).toHaveText("3");
  await expect(page.getByTestId("selected-connector-points")).toHaveText(
    "280,155,440,155",
  );

  await page.getByRole("button", { name: /Drag source/ }).click();
  const livePointsBeforeDrag = await page
    .getByTestId("live-connector-points")
    .innerText();
  await page.mouse.move(box.x + 270, box.y + 235);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 275, { steps: 6 });
  await expect(page.getByTestId("live-connector-points")).not.toHaveText(
    livePointsBeforeDrag,
  );
  await expect(page.getByTestId("live-connector-points")).toContainText(
    ":330:195:440:155",
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "connector", exact: true }).click();
  await expect(page.getByTestId("selected-connector-points")).toHaveText(
    "330,195,440,155",
  );

  const attachedEnd = { x: box.x + 492, y: box.y + 235 };
  const targetTopHandle = { x: box.x + 610, y: box.y + 152 };
  await page.mouse.move(attachedEnd.x, attachedEnd.y);
  await page.mouse.down();
  await page.mouse.move(targetTopHandle.x, targetTopHandle.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("selected-connector-points")).toHaveText(
    "330,195,530,100",
  );

  const attachedTop = { x: box.x + 610, y: box.y + 152 };
  const freeDrop = { x: box.x + 650, y: box.y + 400 };
  await page.mouse.move(attachedTop.x, attachedTop.y);
  await page.mouse.down();
  await page.mouse.move(freeDrop.x, freeDrop.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("selected-connector-points")).toHaveText(
    "330,195,570,320",
  );
});

test("attaches connectors to anchors, follows geometry, detaches safely, and supports endpoint resizing", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);
  await createAt(page, "Rectangle", { x: 180, y: 180 });
  await editSelectedText(page, "Source");
  await createAt(page, "Ellipse", { x: 520, y: 180 });
  await editSelectedText(page, "Target");

  await page.getByRole("button", { name: /Source/ }).click();
  await openContextPanel(page, "Connector controls");
  await expect(
    page.getByRole("button", { name: "Start center", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Start right", exact: true }).click();
  await page.getByRole("button", { name: /Target/ }).click();
  await page.getByRole("button", { name: "Connector", exact: true }).click();
  const surfaceBox = await surface.boundingBox();
  if (!surfaceBox) throw new Error("Canvas surface bounds are unavailable.");
  await surface.click({ position: { x: 520 + 90, y: 180 + 55 } });

  await expect(
    page.getByRole("button", { name: "connector", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "connector", exact: true }).click();
  const pointsBeforeMove = await page
    .getByTestId("selected-connector-points")
    .innerText();

  await page.getByRole("button", { name: /Source/ }).click();
  await surface.focus();
  await surface.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "connector", exact: true }).click();
  await expect(page.getByTestId("selected-connector-points")).not.toHaveText(
    pointsBeforeMove,
  );

  const pointsBeforeEndpointDrag = (
    await page.getByTestId("selected-connector-points").innerText()
  )
    .split(",")
    .map(Number);
  const handlePoints = (
    await page.getByTestId("selected-connector-handle-points").innerText()
  )
    .split(",")
    .map(Number);
  await page.mouse.move(
    surfaceBox.x + 80 + handlePoints[0]!,
    surfaceBox.y + 80 + handlePoints[1]!,
  );
  await page.mouse.down();
  await page.mouse.move(
    surfaceBox.x + 80 + pointsBeforeEndpointDrag[0]! + 70,
    surfaceBox.y + 80 + pointsBeforeEndpointDrag[1]! + 40,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(page.getByTestId("selected-connector-points")).not.toHaveText(
    pointsBeforeEndpointDrag.join(","),
  );

  const detachedPoints = await page
    .getByTestId("selected-connector-points")
    .innerText();
  await page.getByRole("button", { name: /Source/ }).click();
  await surface.focus();
  await surface.press("Shift+ArrowDown");
  await page.getByRole("button", { name: "connector", exact: true }).click();
  await expect(page.getByTestId("selected-connector-points")).toHaveText(
    detachedPoints,
  );

  await surface.focus();
  await surface.press("ArrowDown");
  await expect(page.getByTestId("selected-connector-points")).not.toHaveText(
    detachedPoints,
  );
  await page.reload();
  await ensureObjectNavigator(page);
  await page.getByRole("button", { name: "connector", exact: true }).click();
  await expect(page.getByTestId("selected-connector-points")).toBeVisible();
  await deleteSelection(page);
  await expect(
    page.getByRole("button", { name: "connector", exact: true }),
  ).not.toBeVisible();
});

test("constructs mind-map, procedure, mood-board, and storyboard arrangements from the same primitives", async ({
  page,
}, testInfo) => {
  const surface = await openFreshCanvas(page);

  await createLabeledShape(page, "Rectangle", "Core question", {
    x: 350,
    y: 220,
  });
  await createLabeledShape(page, "Ellipse", "Evidence", { x: 80, y: 160 });
  await createLabeledShape(page, "Ellipse", "Options", { x: 620, y: 160 });
  await createLabeledShape(page, "Diamond", "Decision", { x: 350, y: 390 });
  await connectLabels(page, "Core question", "Evidence", "left", "bottom");
  await connectLabels(page, "Core question", "Options", "right", "bottom");
  await connectLabels(page, "Core question", "Decision", "bottom", "top");
  await expect(page.getByTestId("product-object-count")).toHaveText("7");
  await retainArrangement(surface, testInfo, "mind-map");

  await clearCanvas(page);
  const procedurePositions = [40, 250, 460, 670];
  for (const [index, x] of procedurePositions.entries()) {
    await createLabeledShape(page, "Rectangle", `Step ${index + 1}`, {
      x,
      y: 220,
    });
  }
  for (let index = 0; index < procedurePositions.length - 1; index += 1) {
    await connectLabels(
      page,
      `Step ${index + 1}`,
      `Step ${index + 2}`,
      "right",
      "left",
    );
  }
  await expect(page.getByTestId("product-object-count")).toHaveText("7");
  await retainArrangement(surface, testInfo, "procedure");

  await clearCanvas(page);
  await createLabeledShape(page, "Diamond", "Warm direction", {
    x: 90,
    y: 170,
  });
  await setFill(page, "#fed7aa");
  await createLabeledShape(page, "Ellipse", "Calm direction", {
    x: 340,
    y: 170,
  });
  await setFill(page, "#bfdbfe");
  await createAt(page, "Text", { x: 600, y: 110 });
  await editSelectedText(page, "Mood words\nClear · Human · Spacious");
  await createAt(page, "Table", { x: 270, y: 310 });
  await openContextPanel(page, "Edit table");
  await page
    .getByLabel("Table cells")
    .fill("Tone\tUse\nAmber\tEnergy\nBlue\tTrust");
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
  await retainArrangement(surface, testInfo, "mood-board");

  await clearCanvas(page);
  const storyboardFrames = [
    { x: 80, y: 170, label: "1 · Context" },
    { x: 420, y: 170, label: "2 · Tension" },
    { x: 80, y: 320, label: "3 · Choice" },
    { x: 420, y: 320, label: "4 · Outcome" },
  ];
  for (const frame of storyboardFrames) {
    await createLabeledShape(page, "Rectangle", frame.label, frame);
  }
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
  await retainArrangement(surface, testInfo, "storyboard");

  await page.reload();
  await ensureObjectNavigator(page);
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
});

test("multiselects, marquees, groups, orders, duplicates, uses the clipboard, and walks actor-local history", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);
  await createLabeledShape(page, "Rectangle", "Alpha", { x: 120, y: 140 });
  await createLabeledShape(page, "Rectangle", "Beta", { x: 380, y: 140 });
  await createLabeledShape(page, "Rectangle", "Gamma", { x: 680, y: 140 });

  await page.getByRole("button", { name: /Alpha/ }).click();
  await page
    .getByRole("button", { name: /Beta/ })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  await expect(
    page.getByRole("heading", { name: /Mixed selection/ }),
  ).toBeVisible();
  await openContextPanel(page, "More selection actions");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  await page.getByRole("button", { name: /Alpha/ }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  await openContextPanel(page, "More selection actions");
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();

  const box = await surface.boundingBox();
  if (!box) throw new Error("Canvas surface bounds are unavailable.");
  await page.mouse.move(box.x + 80, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  const primaryX = await selectedNumber(page, "selected-position-x");
  await surface.focus();
  await surface.press("ArrowRight");
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(primaryX + 1),
  );

  await page.getByRole("button", { name: /Alpha/ }).click();
  await openContextPanel(page, "More selection actions");
  await page
    .getByRole("button", { name: "Bring to front", exact: true })
    .click();
  const orderedLabels = await page
    .locator('[data-testid^="object-list-item-"]')
    .allTextContents();
  expect(orderedLabels.at(-1)).toContain("Alpha");

  await openContextPanel(page, "More selection actions");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
  await openContextPanel(page, "More selection actions");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await openContextPanel(page, "More selection actions");
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("product-object-count")).toHaveText("3");
  await surface.focus();
  await surface.press("Control+V");
  await expect(page.getByTestId("product-object-count")).toHaveText("4");

  await surface.press("Control+Z");
  await expect(page.getByTestId("product-object-count")).toHaveText("3");
  await surface.press("Control+Shift+Z");
  await expect(page.getByTestId("product-object-count")).toHaveText("4");

  await surface.focus();
  await surface.press("Control+A");
  await expect(page.getByTestId("selection-status")).toHaveText("4 selected");
  await surface.press("Control+D");
  await expect(page.getByTestId("product-object-count")).toHaveText("8");
  await surface.press("Control+Z");
  await expect(page.getByTestId("product-object-count")).toHaveText("4");

  await page.reload();
  await ensureObjectNavigator(page);
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
});
