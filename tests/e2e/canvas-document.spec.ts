import { expect, test, type Page } from "@playwright/test";

const password = "LocalPassword1!";

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("owner@thinking-canvas.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openSliceFour(page: Page) {
  await page.goto("/spikes");
  await expect(page.getByTestId("canvas-fixture-count")).toHaveText(
    "1,000 objects",
  );
}

test("canvas spike pans, pointer-zooms, transforms, anchors, and records frame evidence", async ({
  page,
}) => {
  await signIn(page);
  await openSliceFour(page);

  const surface = page.getByTestId("konva-surface");
  const scaleBefore = await page.getByTestId("canvas-scale").textContent();
  await surface.hover({ position: { x: 300, y: 220 } });
  await page.mouse.wheel(0, -240);
  await expect(page.getByTestId("canvas-scale")).not.toHaveText(
    scaleBefore ?? "",
  );

  const geometryBefore = await page
    .getByTestId("selected-geometry")
    .textContent();
  const connectorBefore = await page
    .getByTestId("connector-points")
    .textContent();
  await page.getByRole("button", { name: "Move selected" }).click();
  await expect(page.getByTestId("selected-geometry")).not.toHaveText(
    geometryBefore ?? "",
  );
  await expect(page.getByTestId("connector-points")).not.toHaveText(
    connectorBefore ?? "",
  );

  const movedGeometry = await page
    .getByTestId("selected-geometry")
    .textContent();
  await page.getByRole("button", { name: "Resize selected" }).click();
  await expect(page.getByTestId("selected-geometry")).not.toHaveText(
    movedGeometry ?? "",
  );

  await page.getByRole("button", { name: "Pan" }).click();
  const box = await surface.boundingBox();
  if (!box) throw new Error("Canvas surface did not render.");
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 340, { steps: 5 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Measure 1,000 objects" }).click();
  await expect(page.getByTestId("performance-result")).toContainText(
    "Captured 89 frames",
    { timeout: 10_000 },
  );
  await expect(page.getByTestId("average-fps")).not.toHaveText("Not measured");
});

test("focused Lexical document converges across tabs, isolates visuals, exits, and reloads", async ({
  page,
}) => {
  await signIn(page);
  const peer = await page.context().newPage();
  await Promise.all([openSliceFour(page), openSliceFour(peer)]);

  await page.getByRole("button", { name: "Focus document" }).click();
  await expect(page.getByTestId("focused-document")).toBeVisible();
  await peer.getByRole("button", { name: "Focus document" }).click();
  await expect(peer.getByTestId("focused-document")).toBeVisible();

  const ownerEditor = page.getByRole("textbox", {
    name: "Focused collaborative document",
  });
  const peerEditor = peer.getByRole("textbox", {
    name: "Focused collaborative document",
  });
  const sharedText = `Shared document evidence ${Date.now()}`;
  await ownerEditor.fill(sharedText);
  await expect(ownerEditor).toContainText(sharedText);
  await expect(page.getByTestId("document-text-length")).toContainText(
    `${sharedText.length} text characters`,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.localStorage.getItem(
            "thinking-canvas:document-spike:70000000-0000-4000-8000-000000000001",
          )?.length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(peerEditor).toContainText(sharedText);

  const before = Number(
    await page.getByTestId("internal-object-count").textContent(),
  );
  await page
    .getByRole("button", { name: "Add document-internal visual" })
    .click();
  await expect(page.getByTestId("internal-object-count")).toHaveText(
    String(before + 1),
  );
  await expect(peer.getByTestId("internal-object-count")).toHaveText(
    String(before + 1),
  );
  await expect(page.getByTestId("focused-document")).toContainText(
    "Parent connector fields: excluded",
  );

  await page.getByRole("button", { name: "Return to parent canvas" }).click();
  await expect(page.getByTestId("focused-document")).toBeHidden();
  await page.getByRole("button", { name: "Focus document" }).click();
  await expect(ownerEditor).toContainText(sharedText);

  await peer.reload();
  await expect(peer.getByTestId("canvas-fixture-count")).toHaveText(
    "1,000 objects",
  );
  await peer.getByRole("button", { name: "Focus document" }).click();
  await expect(
    peer.getByRole("textbox", { name: "Focused collaborative document" }),
  ).toContainText(sharedText);
  await expect(peer.getByTestId("internal-object-count")).toHaveText(
    String(before + 1),
  );

  await peer.close();
});
