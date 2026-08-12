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
  await expect(page.getByTestId("thinking-workspace")).toBeVisible();
  await expect(page.getByTestId("workspace-top-chrome")).toBeVisible();
  await expect(page.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(page.getByTestId("product-object-count")).toHaveText("0");

  const workspaceBounds = await page
    .getByTestId("thinking-workspace")
    .boundingBox();
  const viewport = page.viewportSize();
  if (!workspaceBounds || !viewport)
    throw new Error("Workspace or viewport dimensions are unavailable.");
  expect(Math.round(workspaceBounds.width)).toBe(viewport.width);
  expect(Math.round(workspaceBounds.height)).toBe(viewport.height);

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

test("copies a member-safe canvas link without granting access", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const nonmemberContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const nonmember = await nonmemberContext.newPage();
  await signIn(owner);
  await owner.goto(`/app/canvases/${seedCanvasId}`);
  await owner.getByRole("button", { name: "Copy canvas link" }).click();
  await expect(owner.getByTestId("share-link-status")).toHaveText(
    "Canvas link copied. Access is still limited to members.",
  );
  const copiedLink = await owner.evaluate(() => navigator.clipboard.readText());
  expect(copiedLink).toBe(owner.url());

  await signIn(nonmember, "nonmember@thinking-canvas.local");
  await nonmember.goto(copiedLink);
  await expect(
    nonmember.getByRole("heading", { name: "This canvas cannot be opened." }),
  ).toBeVisible();
  await expect(
    nonmember.getByText("Synthetic architecture spike canvas"),
  ).not.toBeVisible();

  await ownerContext.close();
  await nonmemberContext.close();
});

test("queues edits through a temporary disconnect, protects navigation, and converges after reconnect", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const title = `Recovery canvas ${Date.now()}`;
  await signIn(owner);
  await owner.getByLabel("Canvas name").fill(title);
  await owner.getByRole("button", { name: "Create canvas" }).click();
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");

  await ownerContext.setOffline(true);
  await owner.getByRole("button", { name: "Rectangle", exact: true }).click();
  await owner.getByTestId("product-canvas-surface").click({
    position: { x: 240, y: 180 },
  });
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Unsynced");
  await expect(owner.getByTestId("product-pending-count")).toHaveText("1");

  owner.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Changes are still waiting to sync");
    await dialog.dismiss();
  });
  await owner.getByRole("link", { name: "Back to canvases" }).click();
  await expect(owner).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);

  await ownerContext.setOffline(false);
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(owner.getByTestId("product-pending-count")).toHaveText("0");
  await owner.reload();
  await expect(owner.getByTestId("product-object-count")).toHaveText("1");

  await ownerContext.close();
});

test("two product canvases converge after concurrent work and a disconnected edit", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner);
  await signIn(editor, "editor@thinking-canvas.local");
  await Promise.all([
    owner.goto(`/app/canvases/${seedCanvasId}`),
    editor.goto(`/app/canvases/${seedCanvasId}`),
  ]);
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect
    .poll(async () =>
      Number(
        await owner.getByTestId("product-participant-count").textContent(),
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () =>
      Number(
        await editor.getByTestId("product-participant-count").textContent(),
      ),
    )
    .toBeGreaterThanOrEqual(2);
  const ownerSurface = owner.getByTestId("product-canvas-surface");
  const ownerBounds = await ownerSurface.boundingBox();
  if (!ownerBounds) throw new Error("Owner canvas bounds are unavailable.");
  await ownerSurface.dispatchEvent("pointermove", {
    clientX: ownerBounds.x + 320,
    clientY: ownerBounds.y + 220,
    pointerType: "mouse",
  });
  await expect(owner.getByTestId("product-cursor-publish-count")).toHaveText(
    /[1-9]\d*\/[1-9]\d* · sent/,
  );
  await expect(editor.getByTestId("product-remote-cursor-count")).toHaveText(
    "1",
  );

  const baseline = Number(
    await owner.getByTestId("product-object-count").textContent(),
  );
  await Promise.all([
    owner.getByRole("button", { name: "Rectangle", exact: true }).click(),
    editor.getByRole("button", { name: "Ellipse", exact: true }).click(),
  ]);
  await Promise.all([
    owner
      .getByTestId("product-canvas-surface")
      .click({ position: { x: 80, y: 500 } }),
    editor
      .getByTestId("product-canvas-surface")
      .click({ position: { x: 850, y: 500 } }),
  ]);
  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 2),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 2),
  );

  await editorContext.setOffline(true);
  await editor.getByRole("button", { name: "Diamond", exact: true }).click();
  await editor
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 700, y: 360 } });
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Unsynced");
  await owner.getByRole("button", { name: "Text", exact: true }).click();
  await owner
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 360, y: 420 } });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 3),
  );

  await editorContext.setOffline(false);
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 4),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 4),
  );
  await owner.getByRole("button", { name: "Add simulated AI idea" }).click();
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );
  await Promise.all([owner.reload(), editor.reload()]);
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(baseline + 5),
  );

  await editorContext.close();
  await ownerContext.close();
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
