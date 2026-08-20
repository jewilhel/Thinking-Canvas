import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const password = "LocalPassword1!";
const seedCanvasId = "20000000-0000-4000-8000-000000000001";

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openFreshCanvas(page: Page) {
  await signIn(page, "owner@thinking-canvas.local");
  await page.getByLabel("Canvas name").fill(`Comment flow ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
}

async function addRectangle(page: Page) {
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Rectangle", exact: true })
    .click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 420, y: 280 } });
  await expect(page.getByTestId("product-object-count")).toHaveText("1");
}

test("creates an anchored structured thread, replies, responds, hides, and reloads", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Comments" })).toBeVisible();
  await page.getByRole("button", { name: "New comment" }).click();
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Does this direction feel clear?");
  await composer.getByLabel("Prompt").selectOption("yes_no");
  await composer.getByRole("button", { name: "Add comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByText("Does this direction feel clear?"),
  ).toBeVisible();
  await thread.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(thread.getByText(/Yes$/)).toBeVisible();
  await thread
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill("Yes, the hierarchy is easy to follow.");
  await thread.getByRole("button", { name: "Send reply" }).click();
  await expect(
    thread.getByText("Yes, the hierarchy is easy to follow."),
  ).toBeVisible();
  await thread.getByRole("button", { name: "Close comment thread" }).click();

  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide markers" }).click();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Show markers" }).click();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("Does this direction feel clear?")).toBeVisible();
  await page.getByText("Does this direction feel clear?").click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("Yes, the hierarchy is easy to follow.");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("permanently deletes an authored comment after confirmation", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "New comment" }).click();
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Temporary feedback to remove.");
  await composer.getByRole("button", { name: "Add comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("cannot be undone");
    await dialog.accept();
  });
  await thread.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(thread).not.toBeVisible();
  await expect(
    page.getByText("Temporary feedback to remove."),
  ).not.toBeVisible();
  await expect(page.getByText("No comments yet.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("No comments yet.")).toBeVisible();
});

test("creates preview AI feedback with explicit provenance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "New comment" }).click();
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Preview suggestion from the canvas assistant.");
  await composer.getByRole("button", { name: "Add as preview AI" }).click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("Thinking Canvas AI");
  const bounds = await page
    .getByRole("dialog", { name: "Comment thread" })
    .boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(768);
});

test("anchors one thread to a complete group and preserves it after target deletion", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Ellipse", exact: true })
    .click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 650, y: 280 } });
  await expect(page.getByTestId("product-object-count")).toHaveText("2");

  await page.getByRole("button", { name: "Open Object navigator" }).click();
  const objects = page.locator('[data-testid^="object-list-item-"]');
  await objects.first().click();
  await objects.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "New comment" }).click();
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("This feedback belongs to the whole group.");
  await composer.getByRole("button", { name: "Add comment" }).click();
  await page
    .getByRole("dialog", { name: "Comment thread" })
    .getByRole("button", { name: "Close comment thread" })
    .click();
  const marker = page.getByRole("button", { name: /Open comment by/ });
  const markerBefore = await marker.boundingBox();

  const surface = page.getByTestId("product-canvas-surface");
  await surface.focus();
  await surface.press("ArrowRight");
  await expect
    .poll(async () => (await marker.boundingBox())?.x)
    .toBeGreaterThan(markerBefore?.x ?? 0);

  await surface.press("Delete");
  await expect(page.getByTestId("product-object-count")).toHaveText("0");
  await expect(page.getByText("Target unavailable")).toBeVisible();
  await page.getByText("This feedback belongs to the whole group.").click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("This feedback belongs to the whole group.");

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("Target unavailable")).toBeVisible();
});

test("renders review and fixed rating controls and preserves closed history", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();

  async function createPrompt(body: string, kind: "review" | "rating") {
    await page.getByRole("button", { name: "New comment" }).click();
    const composer = page.getByRole("dialog", { name: "New comment" });
    await composer
      .getByRole("textbox", { name: "Comment", exact: true })
      .fill(body);
    await composer.getByLabel("Prompt").selectOption(kind);
    await composer.getByRole("button", { name: "Add comment" }).click();
    return page.getByRole("dialog", { name: "Comment thread" });
  }

  let thread = await createPrompt("Choose a review outcome.", "review");
  await thread.getByRole("button", { name: "Revise", exact: true }).click();
  await expect(thread.getByText(/Revise$/)).toBeVisible();
  await thread.getByRole("button", { name: "Close comment thread" }).click();

  thread = await createPrompt("Rate this direction.", "rating");
  await thread.getByRole("button", { name: "5", exact: true }).click();
  await expect(thread.getByText("5 / 5")).toBeVisible();
  await thread.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(thread.getByText("resolved", { exact: true })).toBeVisible();
  await expect(
    thread.getByRole("textbox", { name: "Reply" }),
  ).not.toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByText("Rate this direction.").click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("5 / 5");
});

test("broadcasts comment changes between canvas members", async ({
  browser,
}) => {
  const threadBody = `Realtime feedback ${Date.now()} is visible to collaborators.`;
  const replyBody = `Editor reply ${Date.now()} arrived live.`;
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner, "owner@thinking-canvas.local");
  await signIn(editor, "editor@thinking-canvas.local");
  await Promise.all([
    owner.goto(`/app/canvases/${seedCanvasId}`),
    editor.goto(`/app/canvases/${seedCanvasId}`),
  ]);

  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect
    .poll(async () => {
      const ownerValue = await owner
        .getByTestId("product-object-count")
        .textContent();
      const editorValue = await editor
        .getByTestId("product-object-count")
        .textContent();
      return ownerValue === editorValue;
    })
    .toBe(true);
  const ownerCount = Number(
    await owner.getByTestId("product-object-count").textContent(),
  );
  await owner.getByRole("button", { name: "Shapes", exact: true }).click();
  await owner
    .getByRole("menuitemradio", { name: "Rectangle", exact: true })
    .click();
  await owner
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 520, y: 360 } });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(ownerCount + 1),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(ownerCount + 1),
  );

  await editor.getByRole("button", { name: "Comments", exact: true }).click();
  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await owner.getByRole("button", { name: "New comment" }).click();
  const composer = owner.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill(threadBody);
  await composer.getByRole("button", { name: "Add comment" }).click();

  await expect(editor.getByText(threadBody)).toBeVisible();
  await editor.getByText(threadBody).click();
  const editorThread = editor.getByRole("dialog", { name: "Comment thread" });
  await editorThread
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill(replyBody);
  await editorThread.getByRole("button", { name: "Send reply" }).click();
  await expect(editorThread.getByText(replyBody)).toBeVisible();
  await expect(owner.getByText(replyBody)).toBeVisible();

  await editorContext.close();
  await ownerContext.close();
});
