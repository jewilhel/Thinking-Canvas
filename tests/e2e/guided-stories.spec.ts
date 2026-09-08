import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const password = "LocalPassword1!";

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("owner@thinking-canvas.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function enableTrustedPrimaryAi(page: Page) {
  await page
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  const panel = page.getByRole("dialog", { name: "Comments" });
  await panel.getByLabel("AI authority").selectOption("trusted_editor");
  const enabled = panel.getByRole("checkbox", { name: "Enabled" });
  if (!(await enabled.isChecked())) await enabled.click();
  await panel.getByRole("button", { name: "Close Comments" }).click();
}

test("manages and reloads live canvas viewport scenes", async ({
  browser,
  page,
}) => {
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`Story test ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  const canvasUrl = page.url();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");

  await page.getByRole("button", { name: "Zoom in" }).click();
  const capturedScale = await page
    .getByTestId("product-canvas-surface")
    .getAttribute("data-viewport-scale");

  await page.getByRole("button", { name: "Open scenes" }).click();
  await expect(page.getByText("No scenes")).toBeVisible();
  await page.getByRole("button", { name: "Add Scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 1", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Add Scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Add Scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 3", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Scene actions for Scene 2" }).click();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Rename Scene 2" }).fill("Detail");
  await page.getByRole("textbox", { name: "Rename Scene 2" }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Detail", exact: true }),
  ).toBeVisible();

  const sceneList = page.getByRole("list", { name: "Story scenes" });
  const sceneRows = sceneList.locator(":scope > li");
  await sceneRows.nth(2).dragTo(sceneRows.nth(1));
  await expect(sceneList).toContainText(/Scene 1[\s\S]*Scene 3[\s\S]*Detail/);
  await expect(
    page.getByRole("button", { name: "Move selected scene earlier" }),
  ).toHaveCount(0);

  const scenePanel = page.getByTestId("scene-panel");
  const panelBeforeMove = await scenePanel.boundingBox();
  const moveHandle = await page
    .getByRole("button", { name: "Move scene panel" })
    .boundingBox();
  expect(panelBeforeMove).not.toBeNull();
  expect(moveHandle).not.toBeNull();
  await page.mouse.move(
    moveHandle!.x + moveHandle!.width / 2,
    moveHandle!.y + moveHandle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(moveHandle!.x - 60, moveHandle!.y - 30);
  await page.mouse.up();
  const panelAfterMove = await scenePanel.boundingBox();
  expect(panelAfterMove!.x).toBeLessThan(panelBeforeMove!.x);

  const resizeHandle = await page
    .getByRole("button", { name: "Resize scene panel from left edge" })
    .boundingBox();
  await page.mouse.move(
    resizeHandle!.x + resizeHandle!.width / 2,
    resizeHandle!.y + resizeHandle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(resizeHandle!.x - 80, resizeHandle!.y);
  await page.mouse.up();
  const panelAfterResize = await scenePanel.boundingBox();
  expect(panelAfterResize!.width).toBeGreaterThan(panelAfterMove!.width);
  expect(panelAfterResize!.width).toBeLessThanOrEqual(640);
  await page.getByRole("button", { name: "Previous scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 1", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 3", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  expect(
    await page
      .getByRole("button", { name: "Previous scene" })
      .evaluate((button) =>
        [...(button.parentElement?.querySelectorAll("button") ?? [])]
          .slice(0, 3)
          .map((item) => item.getAttribute("aria-label")),
      ),
  ).toEqual(["Previous scene", "Open scenes", "Next scene"]);

  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await page.getByRole("button", { name: "Previous scene" }).click();
  await expect(
    page.getByRole("button", { name: "Detail", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 1", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await page.getByRole("switch", { name: "Loop" }).click();
  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous scene" }),
  ).toBeDisabled();
  await page.getByRole("switch", { name: "Loop" }).click();

  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(
    page.getByRole("heading", { name: "Comment on Scene 1" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Opening context only");
  await page.getByRole("button", { name: "Submit comment" }).click();
  await expect(page.getByText("Opening context only")).toBeVisible();
  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Previous scene" }).click();
  await page.getByRole("button", { name: "Open scenes" }).click();
  await expect(page.getByText("Opening context only")).toBeVisible();
  await page.getByRole("button", { name: "Scene 3", exact: true }).click();
  await expect(page.getByText("Opening context only")).toHaveCount(0);
  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await expect(page.getByText("Opening context only")).toBeVisible();

  await page
    .getByRole("button", { name: "Edit narration for Scene 1" })
    .click();
  await page
    .getByRole("textbox", { name: "Narration for Scene 1" })
    .fill("Introduce the full canvas before focusing on details.");
  await page.getByRole("button", { name: "Save narration" }).click();
  await expect(page.getByTestId("active-scene-caption")).toHaveText(
    "Introduce the full canvas before focusing on details.",
  );
  await expect(page.getByTestId("story-caption-overlay")).toHaveText(
    "Introduce the full canvas before focusing on details.",
  );

  await page.getByRole("button", { name: "Close scenes" }).click();
  await enableTrustedPrimaryAi(page);
  await page.getByRole("button", { name: "Open scenes" }).click();
  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await page.getByRole("button", { name: "Add comment" }).click();
  const sceneComposer = page.getByRole("dialog", {
    name: "Comment on Scene 1",
  });
  const sceneComment = sceneComposer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await sceneComment.fill("@");
  await sceneComposer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await sceneComment.fill("Please revise this scene narration.");
  await sceneComposer.getByRole("button", { name: "Submit comment" }).click();
  const sceneThread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    sceneThread.getByText("I revised the narration for this scene."),
  ).toBeVisible();
  await sceneThread
    .getByRole("button", { name: "Close comment thread" })
    .click();
  await page.getByRole("button", { name: "Open scenes" }).click();
  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await expect(page.getByTestId("active-scene-caption")).toHaveText(
    "AI revised narration for this scene.",
  );

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await signIn(secondPage);
  await secondPage.goto(canvasUrl);
  await expect(secondPage.getByTestId("canvas-save-status")).toHaveText(
    "Saved",
  );
  await secondPage.getByRole("button", { name: "Open scenes" }).click();
  await expect(
    secondPage.getByRole("list", { name: "Story scenes" }),
  ).toContainText(/Scene 1[\s\S]*Scene 3[\s\S]*Detail/);
  await secondPage
    .getByRole("button", { name: "Scene 1", exact: true })
    .click();
  await expect(secondPage.getByText("Opening context only")).toBeVisible();
  await expect(secondPage.getByTestId("active-scene-caption")).toHaveText(
    "AI revised narration for this scene.",
  );
  await secondContext.close();

  await page.getByRole("button", { name: "Zoom out" }).click();
  const replacementScale = await page
    .getByTestId("product-canvas-surface")
    .getAttribute("data-viewport-scale");
  await page.getByRole("button", { name: "Scene actions for Scene 1" }).click();
  await page.getByRole("button", { name: "Replace" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await expect(page.getByTestId("product-canvas-surface")).toHaveAttribute(
    "data-viewport-scale",
    replacementScale ?? capturedScale ?? "1.08",
  );

  await page.getByRole("button", { name: "Scene actions for Detail" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("button", { name: "Detail", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Deleted Detail")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("button", { name: "Detail", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scene 1", exact: true }).click();
  await expect(page.getByTestId("active-scene-caption")).toHaveText(
    "AI revised narration for this scene.",
  );

  await page.reload();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Open scenes" }).click();
  await expect(page.getByRole("switch", { name: "Loop" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Scene 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scene 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Detail", exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 800, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 1", exact: true }),
  ).toHaveAttribute("aria-current", "step");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
