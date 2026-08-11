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
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(page.getByTestId("product-object-count")).toHaveText("0");

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
