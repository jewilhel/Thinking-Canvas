import { expect, test, type Page } from "@playwright/test";

const canvasId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const now = "2026-08-11T16:00:00.000Z";

async function signIn(page: Page, email = "owner@thinking-canvas.local") {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("LocalPassword1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

function makeObject(index: number) {
  return {
    schemaVersion: 1,
    id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`,
    canvasId,
    createdBy: ownerId,
    createdAt: now,
    updatedAt: now,
    type: "text",
    text: "Bounded context fixture",
    geometry: { x: index, y: 20, width: 240, height: 80, rotation: 0 },
  };
}

test("AI and Realtime routes reject unauthenticated credential requests", async ({
  request,
}) => {
  const [ai, realtime] = await Promise.all([
    request.post("/api/spikes/ai/command", {
      data: { canvasId, instruction: "Change it", objects: [makeObject(1)] },
    }),
    request.post("/api/spikes/realtime/token", { data: { canvasId } }),
  ]);

  expect(ai.status()).toBe(401);
  expect(realtime.status()).toBe(401);
});

test("commenters are denied before an AI provider request", async ({
  page,
}) => {
  await signIn(page, "commenter@thinking-canvas.local");
  const response = await page.request.post("/api/spikes/ai/command", {
    data: {
      canvasId,
      instruction: "Rewrite this.",
      objects: [makeObject(1)],
    },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    error: "The current actor is not permitted to mutate this canvas.",
  });
});

test("non-members cannot mint a Realtime browser credential", async ({
  page,
}) => {
  await signIn(page, "nonmember@thinking-canvas.local");
  const response = await page.request.post("/api/spikes/realtime/token", {
    data: { canvasId },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "Canvas access denied.",
  });
});

test("oversized AI context is rejected before the unconfigured upstream call", async ({
  page,
}) => {
  await signIn(page);
  const response = await page.request.post("/api/spikes/ai/command", {
    data: {
      canvasId,
      instruction: "Rewrite the selected items.",
      objects: Array.from({ length: 201 }, (_, index) => makeObject(index)),
    },
  });

  expect(response.status()).toBe(413);
  await expect(response.json()).resolves.toMatchObject({
    error: expect.stringContaining("limited to 200 objects"),
  });
});

test("field-aware reversal preserves a later unrelated human move", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/spikes");
  await expect(
    page.getByRole("heading", { name: "AI, voice, and precise reversal" }),
  ).toBeVisible();

  const originalText = await page.getByTestId("reversal-text").textContent();
  await page.getByRole("button", { name: "Stage test AI edit" }).click();
  await expect(page.getByTestId("reversal-text")).not.toHaveText(
    originalText ?? "",
  );
  await page.getByRole("button", { name: "Apply later human move" }).click();
  await expect(page.getByTestId("reversal-position")).toHaveText("620, 280");

  await page
    .getByRole("button", { name: "Reverse recorded AI fields" })
    .click();
  await expect(page.getByTestId("reversal-text")).toHaveText(
    originalText ?? "",
  );
  await expect(page.getByTestId("reversal-position")).toHaveText("620, 280");
  await expect(page.getByTestId("ai-status")).toContainText(
    "later unrelated edits preserved",
  );
});

test("configured-route failures stay explicit and non-secret", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/spikes");

  await page
    .getByRole("button", { name: "Run authenticated AI command" })
    .click();
  await expect(page.getByTestId("ai-status")).toHaveText(
    "OpenAI is not configured for this environment.",
  );

  await page.getByRole("button", { name: "Connect microphone" }).click();
  await expect(
    page.getByText("OpenAI is not configured for this environment."),
  ).toHaveCount(2);
});
