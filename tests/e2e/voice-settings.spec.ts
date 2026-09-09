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
    .getByRole("button", { name: "Voice settings", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Voice settings",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Detect a finished turn").selectOption("server_vad");
  await expect(panel.getByLabel("Speech threshold")).toBeVisible();
  await panel.getByLabel("Silence before responding (ms)").fill("900");
  await panel.getByLabel("Preset name", { exact: true }).fill("QA pause");
  await panel.getByRole("button", { name: "Save preset", exact: true }).click();
  await panel.getByRole("button", { name: "Reset to baseline" }).click();
  await expect(panel.getByLabel("Speech threshold")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Load QA pause", exact: true })
    .click();
  await expect(panel.getByLabel("Silence before responding (ms)")).toHaveValue(
    "900",
  );
  await expect(
    panel.getByRole("button", { name: "Apply settings", exact: true }),
  ).toBeDisabled();
  await panel
    .getByText("API-confirmed effective values", { exact: true })
    .click();
  await expect(
    panel.getByText("No API-confirmed session yet.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close Voice settings", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Voice settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load QA pause", exact: true })
    .click();
  await expect(page.getByLabel("Silence before responding (ms)")).toHaveValue(
    "900",
  );
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
      settings: expect.objectContaining({ silenceMs: 900 }),
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
