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

  await page.getByRole("button", { name: "Move Scene 3 earlier" }).click();
  await expect(page.getByRole("list", { name: "Story scenes" })).toContainText(
    /Scene 1[\s\S]*Scene 3[\s\S]*Detail/,
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

  await page.reload();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Open scenes" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scene 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Detail", exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
