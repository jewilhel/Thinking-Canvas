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

async function openFreshCanvas(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("owner@thinking-canvas.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByLabel("Canvas name").fill(`Object matrix ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  return page.getByTestId("product-canvas-surface");
}

async function createAt(
  page: Page,
  tool: "Rectangle" | "Ellipse" | "Diamond" | "Text" | "Table",
  position: { x: number; y: number },
) {
  await page.getByRole("button", { name: tool, exact: true }).click();
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
    await page.getByRole("button", { name: "Delete", exact: true }).click();
  }
}

async function createLabeledShape(
  page: Page,
  tool: "Rectangle" | "Ellipse" | "Diamond",
  label: string,
  position: { x: number; y: number },
) {
  await createAt(page, tool, position);
  await page.getByLabel("Object content").fill(label);
}

async function connectLabels(
  page: Page,
  source: string,
  target: string,
  startAnchor = "center",
  targetAnchor = "center",
) {
  await page.getByRole("button", { name: new RegExp(source) }).click();
  await page
    .getByRole("button", { name: `Start ${startAnchor}`, exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(target) }).click();
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
  await page.getByLabel("Object content").fill("Styled planning idea");
  await page.getByLabel("Fill color").fill("#fef3c7");
  await page.getByLabel("Outline color").fill("#d97706");
  await page.getByLabel("Typeface").selectOption({ label: "Georgia" });
  await page.getByLabel("Text size").fill("22");

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
    x: box.x + 80 + xBeforePointer + (widthBeforeKeyboard + 1) / 2,
    y: box.y + 80 + yBeforePointer + 55,
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
  await page.getByLabel("Object content").fill("A text primitive");
  await surface.focus();
  await surface.press("ArrowDown");
  await surface.press("Alt+ArrowDown");

  await createAt(page, "Table", { x: 360, y: 330 });
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
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
  await page.getByRole("button", { name: /Styled planning idea/ }).click();
  await expect(page.getByLabel("Fill color")).toHaveValue("#fef3c7");
  await expect(page.getByLabel("Outline color")).toHaveValue("#d97706");
  await expect(page.getByLabel("Typeface")).toHaveValue(
    "Georgia, ui-serif, serif",
  );
  await expect(page.getByLabel("Text size")).toHaveValue("22");

  for (const label of [
    /Styled planning idea/,
    /A text primitive/,
    /table — 2 rows/,
    /ellipse/,
    /diamond/,
  ]) {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
  }
  await expect(page.getByTestId("product-object-count")).toHaveText("0");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("attaches connectors to anchors, follows geometry, detaches safely, and supports endpoint resizing", async ({
  page,
}) => {
  const surface = await openFreshCanvas(page);
  await createAt(page, "Rectangle", { x: 180, y: 180 });
  await page.getByLabel("Object content").fill("Source");
  await createAt(page, "Ellipse", { x: 520, y: 180 });
  await page.getByLabel("Object content").fill("Target");

  await page.getByRole("button", { name: /Source/ }).click();
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
  await page.mouse.move(
    surfaceBox.x + 80 + pointsBeforeEndpointDrag[0]!,
    surfaceBox.y + 80 + pointsBeforeEndpointDrag[1]!,
  );
  await page.mouse.down();
  await page.mouse.move(
    surfaceBox.x + 80 + pointsBeforeEndpointDrag[0]! + 42,
    surfaceBox.y + 80 + pointsBeforeEndpointDrag[1]! + 18,
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
  await page.getByRole("button", { name: "connector", exact: true }).click();
  await expect(page.getByTestId("selected-connector-points")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
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
  await createLabeledShape(page, "Ellipse", "Evidence", { x: 80, y: 80 });
  await createLabeledShape(page, "Ellipse", "Options", { x: 620, y: 80 });
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
    y: 90,
  });
  await page.getByLabel("Fill color").fill("#fed7aa");
  await createLabeledShape(page, "Ellipse", "Calm direction", {
    x: 340,
    y: 90,
  });
  await page.getByLabel("Fill color").fill("#bfdbfe");
  await createAt(page, "Text", { x: 600, y: 110 });
  await page
    .getByLabel("Object content")
    .fill("Mood words\nClear · Human · Spacious");
  await createAt(page, "Table", { x: 270, y: 310 });
  await page
    .getByLabel("Table cells")
    .fill("Tone\tUse\nAmber\tEnergy\nBlue\tTrust");
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
  await retainArrangement(surface, testInfo, "mood-board");

  await clearCanvas(page);
  const storyboardFrames = [
    { x: 80, y: 90, label: "1 · Context" },
    { x: 420, y: 90, label: "2 · Tension" },
    { x: 80, y: 320, label: "3 · Choice" },
    { x: 420, y: 320, label: "4 · Outcome" },
  ];
  for (const frame of storyboardFrames) {
    await createLabeledShape(page, "Rectangle", frame.label, frame);
  }
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
  await retainArrangement(surface, testInfo, "storyboard");

  await page.reload();
  await expect(page.getByTestId("product-object-count")).toHaveText("4");
});
