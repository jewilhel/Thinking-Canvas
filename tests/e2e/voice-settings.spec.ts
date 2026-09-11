import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
const canvasId = "20000000-0000-4000-8000-000000000001";
test("tuning panel preserves presets and distinguishes drafts from confirmed settings", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("owner@thinking-canvas.local");
  await page.getByLabel("Password").fill("LocalPassword1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/app/canvases/${canvasId}`);
  await page
    .getByRole("button", { name: "Start AI voice", exact: true })
    .click({ modifiers: ["Control"] });
  const panel = page.getByRole("dialog", {
    name: "Voice settings",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Detect a finished turn")).toHaveCount(0);
  await panel.getByLabel("Idle timeout (seconds)").fill("90");
  await panel.getByLabel("Preset name", { exact: true }).fill("QA pause");
  await panel.getByRole("button", { name: "Save preset", exact: true }).click();
  await panel.getByRole("button", { name: "Reset to baseline" }).click();
  await expect(panel.getByLabel("Idle timeout (seconds)")).toHaveValue("120");
  await panel
    .getByRole("button", { name: "Load QA pause", exact: true })
    .click();
  await expect(panel.getByLabel("Idle timeout (seconds)")).toHaveValue("90");
  await expect(
    panel.getByRole("button", {
      name: "Restart with these settings",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    panel.getByText("No API-confirmed session yet.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close Voice settings", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Start AI voice", exact: true })
    .click({ modifiers: ["Control"] });
  await page
    .getByRole("button", { name: "Load QA pause", exact: true })
    .click();
  await expect(page.getByLabel("Idle timeout (seconds)")).toHaveValue("90");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export presets", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, "utf8"));
  expect(exported).toEqual([
    expect.objectContaining({
      name: "QA pause",
      version: 2,
      settings: expect.objectContaining({ idleSeconds: 90 }),
    }),
  ]);
});
test("unauthenticated callers cannot open supervised sessions", async ({
  request,
}) => {
  const response = await request.post(`/api/canvases/${canvasId}/voice`, {
    data: {},
  });
  expect(response.status()).toBe(403);
});
