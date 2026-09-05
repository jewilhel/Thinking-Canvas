import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

const password = "LocalPassword1!";
const seedCanvasId = "20000000-0000-4000-8000-000000000001";

async function signIn(page: Page, email = "owner@thinking-canvas.local") {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openNamedDocument(page: Page, title: string) {
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.getByRole("button", { name: `document — ${title}` }).click();
  await page.getByTestId("product-canvas-surface").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("focused-product-document")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("document-scroll-container")
        .evaluate((element) => element.scrollTop),
    )
    .toBe(0);
}

async function configurePrimaryAiForDocuments(page: Page) {
  await page
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  const panel = page.getByRole("dialog", { name: "Comments" });
  await panel.getByLabel("AI authority").selectOption("edit_with_review");
  const enabled = panel.getByRole("checkbox", { name: "Enabled" });
  if (!(await enabled.isChecked())) await enabled.click();
  await panel.getByRole("button", { name: "Close Comments" }).click();
}

test("creates, focuses, configures, restores, and reloads a product document", async ({
  page,
}) => {
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`Document canvas ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);

  const surface = page.getByTestId("product-canvas-surface");
  const initialViewport = await surface.evaluate((element) => ({
    x: element.getAttribute("data-viewport-x"),
    y: element.getAttribute("data-viewport-y"),
    scale: element.getAttribute("data-viewport-scale"),
  }));

  await page.getByRole("button", { name: "Document", exact: true }).click();
  await surface.click({ position: { x: 410, y: 260 } });
  await expect(page.getByTestId("product-object-count")).toHaveText("1");
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(
    page.locator('[data-testid^="document-page-preview-"]'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-testid^="document-page-preview-"]')
        .evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .not.toBe("none");

  await page.getByRole("button", { name: "Open document" }).click();
  await expect(page.getByTestId("focused-product-document")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("focused-product-document")
        .evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .not.toBe("none");
  await expect(surface).toBeVisible();
  await expect(page.getByTestId("workspace-top-chrome")).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Document controls" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("toolbar", { name: "Document controls" })
      .getByRole("button", { name: /comment/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "Text formatting" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy to Markdown" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Paste from Markdown" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export Markdown" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to canvas" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("document-layout-label")).toHaveCount(0);
  await expect(page.getByTestId("workspace-primary-dock")).toHaveCount(0);
  const canvasBounds = await surface.boundingBox();
  const focusedBounds = await page
    .getByTestId("focused-product-document")
    .boundingBox();
  const documentControlsBounds = await page
    .getByRole("toolbar", { name: "Document controls" })
    .boundingBox();
  expect(canvasBounds).not.toBeNull();
  expect(focusedBounds).not.toBeNull();
  expect(documentControlsBounds).not.toBeNull();
  expect(focusedBounds!.width).toBeLessThan(canvasBounds!.width - 160);
  expect(focusedBounds!.x).toBeGreaterThan(canvasBounds!.x + 60);
  expect(focusedBounds!.y).toBeGreaterThanOrEqual(canvasBounds!.y + 90);
  expect(focusedBounds!.y + focusedBounds!.height).toBeLessThanOrEqual(
    canvasBounds!.y + canvasBounds!.height - 20,
  );
  expect(
    documentControlsBounds!.x + documentControlsBounds!.width / 2,
  ).toBeCloseTo(focusedBounds!.x + focusedBounds!.width / 2, 0);
  expect(
    documentControlsBounds!.y + documentControlsBounds!.height,
  ).toBeLessThan(focusedBounds!.y);
  await page.getByLabel("Document title").fill("Planning brief");
  await page.getByLabel("Document title").blur();
  await page
    .getByLabel("Document body")
    .fill("A durable shared document body.");
  await expect(
    page.getByRole("toolbar", { name: "Text formatting" }),
  ).toHaveCount(0);
  await page.getByLabel("Document body").selectText();
  const formattingPalette = page.getByRole("toolbar", {
    name: "Text formatting",
  });
  await expect(formattingPalette).toBeVisible();
  const selectionTop = await page.evaluate(
    () => window.getSelection()!.getRangeAt(0).getBoundingClientRect().top,
  );
  const formattingBounds = await formattingPalette.boundingBox();
  expect(formattingBounds).not.toBeNull();
  expect(formattingBounds!.y + formattingBounds!.height).toBeLessThanOrEqual(
    selectionTop + 4,
  );

  await page.getByRole("button", { name: /document settings/i }).click();
  await page.getByLabel("Display font").selectOption("serif");
  await page.getByLabel("Reading size").selectOption("large");
  await page.getByLabel("Layout").selectOption("a4-landscape");
  await page.getByRole("button", { name: "Blue document background" }).click();
  await expect(page.getByLabel("Layout")).toHaveValue("a4-landscape");
  await expect(page.getByTestId("document-reading-surface")).toHaveCSS(
    "font-family",
    /Georgia/,
  );
  await expect(page.getByTestId("document-reading-surface")).toHaveCSS(
    "background-color",
    "rgb(239, 246, 255)",
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Done" }).click();
  await surface.click({ position: { x: 24, y: 300 } });
  await expect(page.getByTestId("focused-product-document")).toHaveCount(0);
  await expect(page.getByTestId("workspace-primary-dock")).toBeVisible();
  const preview = page.locator('[data-testid^="document-page-preview-"]');
  await expect(preview).toContainText("Planning brief");
  await expect(preview.getByTestId("product-document-preview-body")).toHaveText(
    "A durable shared document body.",
  );
  await expect(preview).not.toContainText("A4");
  await expect(preview).not.toContainText("landscape");
  await expect(surface).toHaveAttribute("data-viewport-x", initialViewport.x!);
  await expect(surface).toHaveAttribute("data-viewport-y", initialViewport.y!);
  await expect(surface).toHaveAttribute(
    "data-viewport-scale",
    initialViewport.scale!,
  );
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");

  for (let reopen = 0; reopen < 3; reopen += 1) {
    await surface.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Document body")).toHaveText(
      "A durable shared document body.",
    );
    if (reopen < 2) {
      await surface.click({ position: { x: 24, y: 300 } });
      await expect(page.getByTestId("focused-product-document")).toHaveCount(0);
    }
  }

  await page.reload();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.getByRole("button", { name: "document — Planning brief" }).click();
  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("focused-product-document")).toBeVisible();
  await expect(page.getByLabel("Document title")).toHaveValue("Planning brief");
  await expect(page.getByLabel("Document body")).toHaveText(
    "A durable shared document body.",
  );
  await page.getByRole("button", { name: /document settings/i }).click();
  await expect(page.getByLabel("Layout")).toHaveValue("a4-landscape");
});

test("links selected text and inserts a table below its title", async ({
  page,
}) => {
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`Document tools ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 480, y: 320 } });
  await page.getByRole("button", { name: "Open document" }).click();

  const body = page.getByLabel("Document body");
  await body.fill("Reference title");
  await body.selectText();
  await page.getByRole("button", { name: "Add or remove link" }).click();
  const linkPalette = page.getByRole("dialog", { name: "Add link" });
  await expect(linkPalette).toBeVisible();
  await expect
    .poll(() =>
      linkPalette
        .getByLabel("Link URL")
        .evaluate(
          (element) =>
            getComputedStyle(element).backgroundColor !== "transparent",
        ),
    )
    .toBe(true);
  await linkPalette
    .getByLabel("Link URL")
    .fill("https://example.com/reference");
  await linkPalette.getByLabel("Link URL").press("Enter");
  await expect(linkPalette).toHaveCount(0);
  const link = body.getByRole("link", { name: "Reference title" });
  await expect(link).toHaveAttribute("href", "https://example.com/reference");
  await expect(link).toHaveCSS("text-decoration-line", "underline");

  await link.selectText();
  await page.getByRole("button", { name: "Insert table" }).click();
  await expect(body).toContainText("Reference title");
  await expect(body.locator("table")).toBeVisible();
  await expect
    .poll(() =>
      body.evaluate((element) => {
        const title = element.querySelector("p");
        const table = element.querySelector("table");
        return Boolean(
          title &&
          table &&
          title.compareDocumentPosition(table) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    )
    .toBe(true);
});

test("collaborates on document body and display settings", async ({
  browser,
}: {
  browser: Browser;
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner);
  await signIn(editor, "editor@thinking-canvas.local");
  await owner.goto(`/app/canvases/${seedCanvasId}`);
  await owner.getByRole("button", { name: "Document", exact: true }).click();
  await owner
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 560, y: 340 } });
  await owner.getByRole("button", { name: "Open document" }).click();
  const documentTitle = `Collaboration note ${Date.now()}`;
  await owner.getByLabel("Document title").fill(documentTitle);
  await owner.getByLabel("Document title").blur();
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");

  await editor.goto(`/app/canvases/${seedCanvasId}`);
  await openNamedDocument(editor, documentTitle);

  const collaborativeText = `Shared document text ${Date.now()}`;
  await owner.getByLabel("Document body").fill(collaborativeText);
  await expect(editor.getByLabel("Document body")).toContainText(
    collaborativeText,
  );
  await owner.getByLabel("Document body").selectText();
  await expect
    .poll(() => editor.locator("[data-lexical-document-cursors] span").count())
    .toBeGreaterThan(0);
  await owner.getByRole("button", { name: "Bold" }).click();
  await expect(editor.getByLabel("Document body").locator("strong")).toHaveText(
    collaborativeText,
  );

  await owner.getByRole("button", { name: /document settings/i }).click();
  await owner.getByRole("button", { name: "Rose document background" }).click();
  await expect(editor.getByTestId("document-reading-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 241, 242)",
  );

  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved");
  await ownerContext.close();
  await editorContext.close();
});

test("keeps document range comments attached across two participants", async ({
  browser,
}: {
  browser: Browser;
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner);
  await signIn(editor, "editor@thinking-canvas.local");
  await owner.goto(`/app/canvases/${seedCanvasId}`);
  await owner.getByRole("button", { name: "Document", exact: true }).click();
  await owner
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 620, y: 380 } });
  await owner.getByRole("button", { name: "Open document" }).click();
  const title = `Range comment ${Date.now()}`;
  const commentBody = `Can we tighten ${Date.now()}?`;
  await owner.getByLabel("Document title").fill(title);
  await owner.getByLabel("Document title").blur();
  await owner.getByLabel("Document body").fill("Review this shared sentence.");
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");

  await editor.goto(`/app/canvases/${seedCanvasId}`);
  await openNamedDocument(editor, title);
  await expect(editor.getByLabel("Document body")).toContainText(
    "Review this shared sentence.",
  );

  await owner.getByText("Review this shared sentence.").selectText();
  await owner
    .getByTestId("focused-product-document")
    .getByRole("button", { name: "Comment on selected text" })
    .click();
  const ownerComposer = owner.getByRole("dialog", { name: "New comment" });
  await expect(ownerComposer).toBeVisible();
  await ownerComposer.getByRole("textbox", { name: "Comment" }).fill("@");
  await expect(
    ownerComposer.getByRole("option", { name: /Thinking Canvas AI/ }),
  ).toBeVisible();
  await ownerComposer
    .getByRole("textbox", { name: "Comment" })
    .fill(commentBody);
  await ownerComposer.getByRole("button", { name: "Submit comment" }).click();
  await expect(owner.getByText(commentBody)).toBeVisible();
  await owner.getByRole("button", { name: "Close comment thread" }).click();
  await expect
    .poll(() =>
      owner.evaluate(() => {
        const style = document.querySelector<HTMLStyleElement>(
          "style[data-document-comment-highlight]",
        );
        const name = style?.dataset.documentCommentHighlight;
        return name
          ? (CSS.highlights.get(`document-comment-${name}`)?.size ?? 0)
          : 0;
      }),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      editor.evaluate(() => {
        const style = document.querySelector<HTMLStyleElement>(
          "style[data-document-comment-highlight]",
        );
        const name = style?.dataset.documentCommentHighlight;
        return name
          ? (CSS.highlights.get(`document-comment-${name}`)?.size ?? 0)
          : 0;
      }),
    )
    .toBeGreaterThan(0);

  await editor
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  const editorHistory = editor.getByRole("dialog", { name: "Comments" });
  await expect(editorHistory.getByText(commentBody)).toBeVisible();
  await editorHistory.getByText(commentBody).click();
  const editorThread = editor.getByRole("dialog", { name: "Comment thread" });
  await editorThread
    .getByRole("textbox", { name: "Reply" })
    .fill("Yes, I can revise it.");
  await editorThread.getByRole("button", { name: "Send reply" }).click();

  await owner
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  const ownerHistory = owner.getByRole("dialog", { name: "Comments" });
  await expect(ownerHistory.getByText(commentBody)).toBeVisible();
  await ownerHistory.getByText(commentBody).click();
  await expect(owner.getByText("Yes, I can revise it.")).toBeVisible();
  await owner.getByRole("button", { name: "Resolve" }).click();
  await editor
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  await expect(
    editor
      .getByRole("dialog", { name: "Comments" })
      .getByRole("button")
      .filter({ hasText: commentBody }),
  ).toContainText("resolved");
  await expect
    .poll(() =>
      editor.evaluate(() => {
        const style = document.querySelector<HTMLStyleElement>(
          "style[data-document-comment-highlight]",
        );
        const name = style?.dataset.documentCommentHighlight;
        return name
          ? (CSS.highlights.get(`document-comment-${name}`)?.size ?? 0)
          : 0;
      }),
    )
    .toBe(0);

  await ownerContext.close();
  await editorContext.close();
});

test("applies and undoes a semantic AI document revision while preserving later text", async ({
  page,
}) => {
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`AI document ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await configurePrimaryAiForDocuments(page);
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 480, y: 320 } });
  await page.getByRole("button", { name: "Open document" }).click();

  const body = page.getByLabel("Document body");
  await body.fill("Original document wording.");
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await body.selectText();
  const focusedDocument = page.getByTestId("focused-product-document");
  await focusedDocument
    .getByRole("button", { name: "Comment on selected text" })
    .click();
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer.getByRole("textbox", { name: "Comment" }).fill("@");
  await composer.getByRole("option", { name: /Thinking Canvas AI/ }).click();
  await composer
    .getByRole("textbox", { name: "Comment" })
    .fill("Revise document wording in the selected range.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  await expect(body).toContainText("AI revised document text.");
  await expect(
    page.getByText(
      "I revised the selected document text as one undoable AI change.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo AI change" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close comment thread" }).click();
  await body.focus();
  await body.press("End");
  await body.press("Enter");
  await page.keyboard.type("Human follow-up.");
  await expect(body).toContainText("Human follow-up.");
  await page.waitForTimeout(700);
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page
    .getByRole("button", { name: "Open comment history and AI settings" })
    .click();
  const history = page.getByRole("dialog", { name: "Comments" });
  await history
    .getByText("Revise document wording in the selected range.")
    .click();
  await page.getByRole("button", { name: "Undo AI change" }).click();
  await expect(body).not.toContainText("AI revised document text.");
  await expect(body).toContainText("Original document wording.");
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page.reload();
  await openNamedDocument(page, "Untitled document");
  const reloadedBody = page.getByLabel("Document body");
  await expect(reloadedBody).not.toContainText("AI revised document text.");
  await expect(reloadedBody).toContainText("Human follow-up.");
});

test("paginates while keeping canvas objects outside the document", async ({
  page,
}) => {
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`Contained document ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  const surface = page.getByTestId("product-canvas-surface");

  await page.getByRole("button", { name: "Document", exact: true }).click();
  await surface.click({ position: { x: 460, y: 340 } });
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("button", { name: "Rectangle — basic shape", exact: true })
    .click();
  await surface.click({ position: { x: 460, y: 340 } });
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: "rectangle — New idea" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Object navigator" }).click();

  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const frame = (await page.getByTestId("selection-frame-geometry").innerText())
    .split(",")
    .map(Number);
  const viewportX = Number(await surface.getAttribute("data-viewport-x"));
  const viewportY = Number(await surface.getAttribute("data-viewport-y"));
  const viewportScale = Number(
    await surface.getAttribute("data-viewport-scale"),
  );
  const selectedCenter = {
    x: surfaceBox!.x + viewportX + (frame[0]! + frame[2]! / 2) * viewportScale,
    y: surfaceBox!.y + viewportY + (frame[1]! + frame[3]! / 2) * viewportScale,
  };
  const containmentModifier = await page.evaluate(() =>
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.down(containmentModifier);
  await page.mouse.move(selectedCenter.x, selectedCenter.y);
  await page.mouse.down();
  await page.mouse.move(selectedCenter.x + 8, selectedCenter.y + 8);
  await expect(page.getByTestId("containment-preview-target-type")).toHaveText(
    "—",
  );
  await page.mouse.up();
  await page.keyboard.up(containmentModifier);
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: "rectangle — New idea" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "document — Untitled document" })
    .click();
  await surface.focus();
  await surface.press("Enter");

  await expect(page.getByTestId("document-object-layer")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: /embedded canvas object/ }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /document settings/i }).click();
  await page.getByLabel("Layout").selectOption("letter-portrait");
  await page.getByRole("button", { name: "Done" }).click();
  await page
    .getByLabel("Document body")
    .fill(
      Array.from(
        { length: 140 },
        (_, index) => `Pagination line ${index + 1}`,
      ).join("\n"),
    );
  await expect
    .poll(async () => page.getByTestId("document-page-status").textContent())
    .toMatch(/Page 1 of ([2-9]|[1-9][0-9]+)/);
  const body = page.getByLabel("Document body");
  await body.selectText();
  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString(),
  );
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("document-page-status")).toContainText(
    "Page 2 of",
  );

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(selectedText);
  await surface.click({ position: { x: 24, y: 300 } });
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: "rectangle — New idea" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "rectangle — New idea" }).click();
  await page.getByRole("button", { name: "Close Object navigator" }).click();
  await surface.focus();
  await surface.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Place inside document" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page.reload();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: "rectangle — New idea" }),
  ).toBeVisible();
});

test("formats semantic text and round trips bounded Markdown", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`Markdown canvas ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 420, y: 260 } });
  await page.getByRole("button", { name: "Open document" }).click();

  const markdown = [
    "# Release brief",
    "",
    "A **bold** and *careful* [reference](https://example.com/docs).",
    "",
    "- First item",
    "- Second item",
    "",
    "| Topic | Owner |",
    "| --- | --- |",
    "| Scope | Editor |",
  ].join("\n");
  const body = page.getByLabel("Document body");
  await body.click();
  await page.evaluate(
    (value) => navigator.clipboard.writeText(value),
    markdown,
  );
  await body.press("ControlOrMeta+v");
  await expect(body.locator("h1")).toHaveText("Release brief");
  await expect(body.locator("strong")).toHaveText("bold");
  await expect(body.locator("em")).toHaveText("careful");
  await expect(body.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/docs",
  );
  await expect(body.locator("li")).toHaveCount(2);
  await expect(body.locator("table")).toContainText("Scope");
  await body
    .locator("p")
    .filter({ hasText: "A bold and careful reference" })
    .selectText();
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "mixed",
  );
  await body.click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await expect(
    page.getByRole("button", { name: "Export Markdown" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("dialog", { name: "Export Markdown" }),
  ).toHaveCount(0);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("untitled-document.md");

  await page.getByLabel("Choose Markdown file").setInputFiles({
    name: "Project brief.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("## Imported\n\nSafe body", "utf8"),
  });
  await expect(
    page.getByRole("dialog", { name: "Import Markdown" }),
  ).toHaveCount(0);
  await expect(body.locator("h2")).toHaveText("Imported");
  await expect(body).toContainText("Safe body");
  await expect(page.getByLabel("Document title")).toHaveValue("Project Brief");
  await expect(
    page.getByRole("button", { name: "Import Markdown" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Document title").fill("Edited imported title");
  await page.getByLabel("Document title").blur();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Edited imported title",
  );

  await body.getByText("Safe body").selectText();
  await page.evaluate(() => navigator.clipboard.writeText("Replacement body"));
  await body.press("ControlOrMeta+v");
  await expect(body).toContainText("Replacement body");
  await expect(body).not.toContainText("Safe body");

  await page.waitForTimeout(600);
  await body.getByText("Replacement body").click({ clickCount: 3 });
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(body.locator("strong")).toHaveText("Replacement body");
  await page.waitForTimeout(600);
  await body.press("ControlOrMeta+z");
  await expect(body.locator("strong")).toHaveCount(0);
  await body.press("ControlOrMeta+Shift+z");
  await expect(body.locator("strong")).toHaveText("Replacement body");
  await body.getByText("Replacement body").selectText();
  await body.press("ControlOrMeta+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("**Replacement body**");

  await page.evaluate(() =>
    navigator.clipboard.writeText("<script>alert(1)</script>"),
  );
  await body.press("ControlOrMeta+v");
  await expect(
    page.getByText("Raw HTML is not supported in documents."),
  ).toBeAttached();
  await expect(body.locator("h2")).toHaveText("Imported");
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Edited imported title",
  );
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 24, y: 300 } });
  await page.reload();
  await openNamedDocument(page, "Edited imported title");
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Edited imported title",
  );
});
