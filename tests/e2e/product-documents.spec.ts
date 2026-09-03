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

  await page.getByRole("button", { name: "Open document" }).click();
  await expect(page.getByTestId("focused-product-document")).toBeVisible();
  await page.getByLabel("Document title").fill("Planning brief");
  await page.getByLabel("Document title").blur();
  await page
    .getByLabel("Document body")
    .fill("A durable shared document body.");

  await page.getByRole("button", { name: /document settings/i }).click();
  await page.getByLabel("Display font").selectOption("serif");
  await page.getByLabel("Reading size").selectOption("large");
  await page.getByLabel("Layout").selectOption("a4-landscape");
  await page.getByRole("button", { name: "Blue document background" }).click();
  await expect(page.getByTestId("document-layout-label")).toHaveText(
    "A4 · landscape",
  );
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

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("focused-product-document")).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-viewport-x", initialViewport.x!);
  await expect(surface).toHaveAttribute("data-viewport-y", initialViewport.y!);
  await expect(surface).toHaveAttribute(
    "data-viewport-scale",
    initialViewport.scale!,
  );
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");

  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Document body")).toContainText(
    "A durable shared document body.",
  );
  await page.getByRole("button", { name: "Return to canvas" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.getByRole("button", { name: "document — Planning brief" }).click();
  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("focused-product-document")).toBeVisible();
  await expect(page.getByLabel("Document title")).toHaveValue("Planning brief");
  await expect(page.getByLabel("Document body")).toContainText(
    "A durable shared document body.",
  );
  await expect(page.getByTestId("document-layout-label")).toHaveText(
    "A4 · landscape",
  );
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
    .getByRole("button", { name: "Comments", exact: true })
    .click();
  await expect(
    owner.getByText(/Comment on “Review this shared sentence/),
  ).toBeVisible();
  await owner.getByLabel("New document comment").fill("Can we tighten this?");
  await owner.getByLabel("Structured response").selectOption("yes_no");
  await owner.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(owner.getByText("Can we tighten this?")).toBeVisible();

  await editor
    .getByTestId("focused-product-document")
    .getByRole("button", { name: /Comments/ })
    .click();
  const editorComments = editor.getByRole("complementary", {
    name: "Document comments",
  });
  await expect(editorComments.getByText("Can we tighten this?")).toBeVisible();
  await expect(
    editorComments.getByText("Review this shared sentence.", { exact: true }),
  ).toBeVisible();
  await editor
    .getByLabel("Reply to Can we tighten this?")
    .fill("Yes, I can revise it.");
  await editor.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(owner.getByText("Yes, I can revise it.")).toBeVisible();
  await owner.getByRole("button", { name: "Resolve" }).click();
  await expect(
    editorComments.getByText("resolved", { exact: true }),
  ).toBeVisible();

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
    .getByRole("button", { name: "Comments", exact: true })
    .click();
  await page
    .getByLabel("New document comment")
    .fill("Revise document wording in the selected range.");
  await page.getByRole("checkbox", { name: "Ask AI" }).check();
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  await expect(body).toContainText("AI revised document text.");
  await expect(
    page.getByText(
      "I revised the selected document text as one undoable AI change.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo AI change" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close document comments" }).click();
  await body.focus();
  await body.press("End");
  await body.press("Enter");
  await page.keyboard.type("Human follow-up.");
  await expect(body).toContainText("Human follow-up.");
  await page.waitForTimeout(700);
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await focusedDocument.getByRole("button", { name: /Comments/ }).click();
  await page.getByRole("button", { name: "Undo AI change" }).click();
  await expect(page.getByText("AI document change undone.")).toBeVisible();
  await page.reload();
  await openNamedDocument(page, "Untitled document");
  const reloadedBody = page.getByLabel("Document body");
  await expect(reloadedBody).not.toContainText("AI revised document text.");
  await expect(reloadedBody).toContainText("Human follow-up.");
});

test("paginates and moves a canvas object into and out of a document", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
    "document",
  );
  await page.mouse.up();
  await page.keyboard.up(containmentModifier);
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: /Document child rectangle — New idea/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "document — Untitled document" })
    .click();
  await surface.focus();
  await surface.press("Enter");

  const embedded = page.getByRole("group", {
    name: "New idea embedded canvas object",
  });
  await expect(embedded).toBeVisible();
  await embedded.focus();
  await embedded.press("ArrowRight");
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page
    .getByRole("toolbar", { name: "Embedded object actions" })
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('"documentOwnerId"');
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "New idea embedded canvas object" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Undo canvas object change" }).click();
  await expect(
    page.getByRole("group", { name: "New idea embedded canvas object" }),
  ).toHaveCount(1);

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
  await embedded.focus();
  await page.getByRole("button", { name: "Remove from document" }).click();
  await expect(embedded).toHaveCount(0);
  await page.getByRole("button", { name: "Return to canvas" }).click();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: "rectangle — New idea" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "rectangle — New idea" }).click();
  await page.getByRole("button", { name: "Close Object navigator" }).click();
  await surface.focus();
  await surface.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Place inside document" }).click();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: /Document child rectangle — New idea/ }),
  ).toBeVisible();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page.reload();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await expect(
    page.getByRole("button", { name: /Document child rectangle — New idea/ }),
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

  await page.getByRole("button", { name: "Paste from Markdown" }).click();
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
  await page.getByLabel("Markdown source").fill(markdown);
  await page.getByRole("button", { name: "Replace document" }).click();

  const body = page.getByLabel("Document body");
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

  await page.getByRole("button", { name: "Copy to Markdown" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("# Release brief");
  expect(copied).toContain("**bold**");
  expect(copied).toContain("| Topic | Owner |");
  expect(copied).not.toContain("background");
  await expect(page.getByText(/Copied the complete document/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await expect(
    page.getByRole("dialog", { name: "Export Markdown" }),
  ).toContainText(
    "Document font, reading size, background, layout, page size, and orientation",
  );
  await page.getByRole("button", { name: "Acknowledge and export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("untitled-document.md");

  await page.getByLabel("Choose Markdown file").setInputFiles({
    name: "replacement.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("## Imported\n\nSafe body", "utf8"),
  });
  await expect(
    page.getByRole("dialog", { name: "Import Markdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replace document" }).click();
  await expect(body.locator("h2")).toHaveText("Imported");
  await expect(body).toContainText("Safe body");

  await body.getByText("Safe body").selectText();
  await page.getByRole("button", { name: "Paste from Markdown" }).click();
  await page.getByLabel("Markdown source").fill("Replacement body");
  await page.getByRole("button", { name: "Insert at selection" }).click();
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
  await page.getByRole("button", { name: "Copy to Markdown" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("**Replacement body**");

  await page.getByRole("button", { name: "Paste from Markdown" }).click();
  await page.getByLabel("Markdown source").fill("<script>alert(1)</script>");
  await page.getByRole("button", { name: "Replace document" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Paste from Markdown" })
      .getByRole("alert"),
  ).toContainText("Raw HTML is not supported");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(body.locator("h2")).toHaveText("Imported");
});
