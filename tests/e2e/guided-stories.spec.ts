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

test("captures and reloads a live canvas viewport scene", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Canvas name").fill(`Story test ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");

  await page.getByRole("button", { name: "Zoom in" }).click();
  const capturedScale = await page
    .getByTestId("product-canvas-surface")
    .getAttribute("data-viewport-scale");

  await page.getByRole("button", { name: "Open scenes" }).click();
  await expect(page.getByText("No scenes")).toBeVisible();
  await page.getByRole("button", { name: "Add Scene" }).click();
  await expect(page.getByRole("button", { name: "Scene 1" })).toBeVisible();

  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Scene 1" }).click();
  await expect(page.getByTestId("product-canvas-surface")).toHaveAttribute(
    "data-viewport-scale",
    capturedScale ?? "1.08",
  );

  await page.reload();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Open scenes" }).click();
  await expect(page.getByRole("button", { name: "Scene 1" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
