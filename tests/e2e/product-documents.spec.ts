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
