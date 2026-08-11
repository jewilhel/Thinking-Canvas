import { expect, test, type Page } from "@playwright/test";

const password = "LocalPassword1!";

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openSpike(page: Page) {
  await page.goto("/spikes");
  await expect
    .poll(
      async () => {
        const status = await page
          .getByTestId("connection-status")
          .textContent();
        if (status === "ERROR") {
          throw new Error(
            (await page.getByRole("status").textContent()) ?? status,
          );
        }
        return status;
      },
      { timeout: 15_000 },
    )
    .toBe("SUBSCRIBED");
}

async function objectCount(page: Page) {
  return Number(await page.getByTestId("object-count").textContent());
}

async function expectConverged(left: Page, right: Page, count: number) {
  await expect(left.getByTestId("object-count")).toHaveText(String(count));
  await expect(right.getByTestId("object-count")).toHaveText(String(count));
  await expect
    .poll(async () => {
      const leftHash = await left.getByTestId("state-hash").textContent();
      const rightHash = await right.getByTestId("state-hash").textContent();
      return leftHash !== "loading" && leftHash === rightHash;
    })
    .toBe(true);
}

test("two browsers converge, reconnect, reload, and survive compaction", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();

  await signIn(owner, "owner@thinking-canvas.local");
  await signIn(editor, "editor@thinking-canvas.local");
  await Promise.all([openSpike(owner), openSpike(editor)]);

  await expect
    .poll(async () =>
      Number(await owner.getByTestId("participant-count").textContent()),
    )
    .toBeGreaterThanOrEqual(2);

  const baseline = await objectCount(owner);
  await Promise.all([
    owner.getByRole("button", { name: "Add durable card" }).click(),
    editor.getByRole("button", { name: "Add durable card" }).click(),
  ]);
  await expectConverged(owner, editor, baseline + 2);

  await editor.getByRole("button", { name: "Disconnect realtime" }).click();
  await expect(editor.getByTestId("connection-status")).toHaveText(
    "DISCONNECTED",
  );
  await owner.getByRole("button", { name: "Add durable card" }).click();
  await expect(owner.getByTestId("object-count")).toHaveText(
    String(baseline + 3),
  );
  await expect(editor.getByTestId("object-count")).toHaveText(
    String(baseline + 2),
  );

  await editor.getByRole("button", { name: "Reconnect and reload" }).click();
  await expect(editor.getByTestId("connection-status")).toHaveText(
    "SUBSCRIBED",
  );
  await expectConverged(owner, editor, baseline + 3);

  await owner.getByRole("button", { name: "Compact verified state" }).click();
  await expect(owner.getByTestId("collaboration-status")).toContainText(
    "Verified snapshot v",
  );
  await expect(owner.getByTestId("collaboration-status")).toContainText(
    /pruned [1-9]\d* covered updates/,
  );
  await expect(owner.getByTestId("connection-status")).toHaveText("SUBSCRIBED");

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signIn(viewer, "viewer@thinking-canvas.local");
  await openSpike(viewer);
  await expectConverged(owner, viewer, baseline + 3);

  await owner.getByRole("button", { name: "Compact verified state" }).click();
  await expect(owner.getByTestId("collaboration-status")).toContainText(
    "pruned 0 covered updates",
  );

  await viewerContext.close();
  await editorContext.close();
  await ownerContext.close();
});
