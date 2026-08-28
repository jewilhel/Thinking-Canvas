import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const password = "LocalPassword1!";
const seedCanvasId = "20000000-0000-4000-8000-000000000001";
const editorUserId = "10000000-0000-4000-8000-000000000002";

async function settleButtonTransition(button: Locator) {
  await button.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function expectFilledReadableHover(page: Page, button: Locator) {
  await page.mouse.move(0, 0);
  await settleButtonTransition(button);
  const before = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  });

  await button.hover();
  await settleButtonTransition(button);
  await expect
    .poll(() =>
      button.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(before.backgroundColor);
  await expect
    .poll(() => button.evaluate((element) => getComputedStyle(element).color))
    .toBe(before.color);
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openFreshCanvas(page: Page) {
  await signIn(page, "owner@thinking-canvas.local");
  await page.getByLabel("Canvas name").fill(`Comment flow ${Date.now()}`);
  await page.getByRole("button", { name: "Create canvas" }).click();
  await expect(page).toHaveURL(/\/app\/canvases\/[0-9a-f-]+$/);
}

async function addRectangle(
  page: Page,
  position = { x: 420, y: 280 },
  expectedCount = 1,
) {
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Rectangle", exact: true })
    .click();
  await page.getByTestId("product-canvas-surface").click({ position });
  await expect(page.getByTestId("product-object-count")).toHaveText(
    String(expectedCount),
  );
}

async function addEditorMembership(canvasId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Local Supabase public environment is required.");
  }
  const ownerClient = createClient(url, publishableKey, {
    auth: { persistSession: false },
  });
  const signInResult = await ownerClient.auth.signInWithPassword({
    email: "owner@thinking-canvas.local",
    password,
  });
  expect(signInResult.error).toBeNull();
  const result = await ownerClient.from("canvas_members").insert({
    canvas_id: canvasId,
    user_id: editorUserId,
    role: "editor",
  });
  expect(result.error).toBeNull();
  await ownerClient.auth.signOut();
}

async function placeArmedComment(page: Page, position = { x: 420, y: 280 }) {
  await page
    .getByRole("button", { name: "Place comment on canvas" })
    .click({ position });
}

test("creates an anchored structured thread, replies, responds, hides, and reloads", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Comments" })).toBeVisible();
  await placeArmedComment(page);
  await expect(
    page.getByRole("dialog", { name: "Comments" }),
  ).not.toBeVisible();
  let composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Discard this unsent draft.");
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 760, y: 560 } });
  await expect(composer).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(page);
  composer = page.getByRole("dialog", { name: "New comment" });
  await expect(
    composer.getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("");
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Discard this draft with the close button.");
  await composer
    .getByRole("button", { name: "Close comment composer" })
    .click();
  await expect(composer).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(page);
  composer = page.getByRole("dialog", { name: "New comment" });
  await expect(
    composer.getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("");
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Does this direction feel clear?");
  await composer.getByLabel("Prompt").selectOption("yes_no");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    page.getByRole("dialog", { name: "Comments" }),
  ).not.toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveText("No selection");
  await expect(
    page.getByRole("toolbar", { name: "Selection controls" }),
  ).not.toBeVisible();
  const focusShield = page.getByTestId("comment-focus-shield");
  await expect(focusShield).toBeVisible();
  await focusShield.click({ position: { x: 420, y: 280 } });
  await expect(page.getByTestId("selection-status")).toHaveText("No selection");
  await expect(
    page.getByRole("toolbar", { name: "Selection controls" }),
  ).not.toBeVisible();
  await expect(thread).not.toBeVisible();
  await page.getByRole("button", { name: /Open comment by/ }).click();
  await expect(
    thread.getByText("Does this direction feel clear?"),
  ).toBeVisible();
  await thread.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(
    thread.getByRole("button", { name: "Yes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    thread.getByRole("textbox", { name: "Reply", exact: true }),
  ).not.toBeVisible();
  await expect(thread.getByText(/Owner Example:\s*Yes/)).not.toBeVisible();
  await thread.getByLabel("Prompt").selectOption("");
  await expect(thread.getByLabel("Prompt")).toHaveValue("");
  await expect(
    thread.getByLabel("Prompt").locator('option[value=""]'),
  ).toHaveText("Reply");
  await expect(
    thread.getByRole("button", { name: "Yes", exact: true }),
  ).not.toBeVisible();
  await thread
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill("Yes, the hierarchy is easy to follow.");
  await thread.getByRole("button", { name: "Send reply" }).click();
  await expect(
    thread.getByText("Yes, the hierarchy is easy to follow."),
  ).toBeVisible();
  await thread.getByLabel("Prompt").selectOption("rating");
  await expect(thread.getByLabel("Prompt")).toHaveValue("rating");
  await expect(
    thread.getByRole("button", { name: "5", exact: true }),
  ).toBeVisible();
  await expect(
    thread.getByRole("textbox", { name: "Reply", exact: true }),
  ).not.toBeVisible();
  await thread.getByRole("button", { name: "Edit initial comment" }).click();
  await thread
    .getByRole("textbox", { name: "Edit initial comment" })
    .fill("How clear is this direction from 1 to 5?");
  await thread.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    thread.getByText("How clear is this direction from 1 to 5?"),
  ).toBeVisible();
  await thread.getByRole("button", { name: "Close comment thread" }).click();
  await expect(focusShield).not.toBeVisible();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const commentHistory = page.getByRole("dialog", { name: "Comments" });
  await expect(commentHistory).toBeVisible();
  await commentHistory
    .getByRole("button", {
      name: /How clear is this direction from 1 to 5\?/,
    })
    .click();
  await expect(commentHistory).not.toBeVisible();
  await expect(thread).toBeVisible();
  await thread.getByRole("button", { name: "Close comment thread" }).click();

  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toBeVisible();
  const marker = page.getByRole("button", { name: /Open comment by/ });
  const collapsedMarker = await marker.boundingBox();
  expect(collapsedMarker?.width).toBeCloseTo(52, 0);
  await marker.hover();
  await expect
    .poll(async () => (await marker.boundingBox())?.width ?? 0)
    .toBeGreaterThan(300);
  await expect(marker).toContainText(
    "How clear is this direction from 1 to 5?",
  );
  await marker.click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("How clear is this direction from 1 to 5?");
  await page
    .getByRole("dialog", { name: "Comment thread" })
    .getByRole("button", { name: "Close comment thread" })
    .click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "Hide markers" }).click();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Show markers" }).click();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const persistedThread = page
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", {
      name: /How clear is this direction from 1 to 5\?/,
    });
  await expect(persistedThread).toBeVisible();
  await persistedThread.click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("Yes, the hierarchy is easy to follow.");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("permanently deletes an authored comment after confirmation", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Temporary feedback to remove.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("cannot be undone");
    await dialog.accept();
  });
  await thread.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(thread).not.toBeVisible();
  await expect(
    page.getByText("Temporary feedback to remove."),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("No comments yet.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("No comments yet.")).toBeVisible();
});

test("places comments over an unselected object and on empty canvas", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 760, y: 560 } });
  await expect(page.getByTestId("selection-status")).toHaveText("No selection");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(page);
  let composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Attached without selecting first.");
  await composer.getByRole("button", { name: "Submit comment" }).click();
  await page
    .getByRole("dialog", { name: "Comment thread" })
    .getByRole("button", { name: "Close comment thread" })
    .click();

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByRole("button", { name: "Place comment on canvas" })
    .click({ position: { x: 700, y: 480 } });
  composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Free canvas feedback.");
  await composer.getByRole("button", { name: "Submit comment" }).click();
  const otherMarker = page
    .getByRole("button", { name: /Open comment by/ })
    .filter({ hasText: "Attached without selecting first." });
  await otherMarker.hover();
  await page.waitForTimeout(300);
  expect((await otherMarker.boundingBox())?.width).toBeCloseTo(52, 0);
  await page
    .getByRole("dialog", { name: "Comment thread" })
    .getByRole("button", { name: "Close comment thread" })
    .click();

  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toHaveCount(2);
  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const commentsPanel = page.getByRole("dialog", { name: "Comments" });
  await expect(
    commentsPanel.getByRole("button", {
      name: /Attached without selecting first\./,
    }),
  ).toBeVisible();
  await expect(
    commentsPanel.getByRole("button", { name: /Free canvas feedback\./ }),
  ).toBeVisible();
});

test("addresses the primary AI once and inherits it on the next reply", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Please inspect this canvas direction.");
  await composer.getByRole("button", { name: "Submit comment" }).click();
  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByRole("button", { name: "Remove Thinking Canvas AI" }),
  ).toHaveCount(0);
  await expect(thread.getByText("To (inherited)")).toHaveCount(0);
  const groundedReply = thread.getByText(
    "I inspected 1 canvas objects and 1 comment conversations.",
  );
  await expect(groundedReply).toHaveCount(1);
  const aiReply = thread.locator('[data-comment-author-kind="ai"]').filter({
    hasText: "I inspected 1 canvas objects and 1 comment conversations.",
  });
  await expect(
    aiReply.getByText("Thinking Canvas AI", { exact: true }),
  ).toBeVisible();
  await expect(aiReply.locator('[data-avatar-kind="ai"]')).toHaveText("AI");
  await expect(aiReply.getByText("To Thinking Canvas AI")).toHaveCount(0);
  await thread
    .getByRole("button", { name: /View rectangle: New idea/ })
    .click();
  await expect(page.getByTestId("selection-status")).toContainText("rectangle");
  await thread
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill("Please continue with the same context.");
  await thread.getByRole("button", { name: "Send reply" }).click();
  await expect(
    thread.getByRole("button", { name: "Remove Thinking Canvas AI" }),
  ).toHaveCount(0);
  await expect(groundedReply).toHaveCount(2);
  const bounds = await page
    .getByRole("dialog", { name: "Comment thread" })
    .boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(768);
  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", { name: /Please inspect this canvas direction/ })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Comment thread" })
      .getByText("I inspected 1 canvas objects and 1 comment conversations."),
  ).toHaveCount(2);
});

test("creates a linked AI contextual comment through the existing comment workflow", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();
  await placeArmedComment(page, { x: 850, y: 600 });
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Please leave a contextual comment on the evidence.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const sourceThread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    sourceThread.getByText(
      "I inspected 1 canvas objects and 1 comment conversations.",
    ),
  ).toBeVisible();
  await sourceThread
    .getByRole("button", { name: "Close comment thread" })
    .click();

  const contextualSummary = /Grounded observation: rectangle: New idea/;
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const commentsPanel = page.getByRole("dialog", { name: "Comments" });
  await expect(
    commentsPanel.getByRole("button", { name: contextualSummary }),
  ).toBeVisible();
  await commentsPanel.getByRole("button", { name: contextualSummary }).click();
  const contextualThread = page.getByRole("dialog", {
    name: "Comment thread",
  });
  await expect(
    contextualThread.getByText("Thinking Canvas AI", { exact: true }).first(),
  ).toBeVisible();
  await expect(contextualThread.locator('[data-avatar-kind="ai"]')).toHaveText(
    "AI",
  );
  await expect(contextualThread.getByText("To Owner Example")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Comments" })
      .getByRole("button", { name: contextualSummary }),
  ).toBeVisible();
});

test("returns an ordered AI proposal in comments without changing the canvas", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  const saveStatus = page.getByTestId("canvas-save-status");
  await expect(saveStatus).toHaveAttribute("data-pending-count", "0");
  const durableSequenceBefore = await saveStatus.getAttribute("title");

  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.locator('[data-testid^="object-list-item-"]').first().click();
  const positionBefore = await page
    .getByTestId("selected-position-x")
    .textContent();

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const authority = page.getByLabel("AI authority");
  await authority.selectOption("propose_changes");
  await expect(authority).toHaveValue("propose_changes");
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Propose moving this object to the right.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByText(
      "I prepared a validated proposal without changing the canvas.",
    ),
  ).toBeVisible();
  await expect(
    thread.getByText(
      "The proposal did not change the canvas. Reply if you want me to apply or adjust it.",
    ),
  ).toBeVisible();
  await expect(thread.getByText(/[0-9a-f]{8}-[0-9a-f-]{27}/)).toHaveCount(0);
  await expect(saveStatus).toHaveAttribute(
    "title",
    durableSequenceBefore ?? "",
  );

  await thread.getByRole("button", { name: "Close comment thread" }).click();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    positionBefore ?? "",
  );

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", { name: /Propose moving this object to the right/ })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Comment thread" })
      .getByText(
        "The proposal did not change the canvas. Reply if you want me to apply or adjust it.",
      ),
  ).toBeVisible();
});

test("creates and atomically undoes five labeled sticky notes", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByLabel("AI authority").selectOption("edit_with_review");
  await page.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(page, { x: 420, y: 280 });

  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill(
    "Create five sticky notes labeled Red, Yellow, Orange, Green, and Blue.",
  );
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByText(
      "I created five labeled sticky notes in the requested colors.",
    ),
  ).toBeVisible();
  await expect(
    thread.getByText(
      "The change is on the canvas. You can undo it or reply with adjustments.",
    ),
  ).toBeVisible();
  await expect(thread.getByText(/[0-9a-f]{8}-[0-9a-f-]{27}/)).toHaveCount(0);
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
  await expect(
    page.getByRole("button", { name: "Review AI changes" }),
  ).toHaveCount(0);
  const undoResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/ai/transactions/undo"),
  );
  await thread.getByRole("button", { name: "Undo AI change" }).click();
  const undoResponse = await undoResponsePromise;
  expect(undoResponse.ok(), await undoResponse.text()).toBeTruthy();
  await expect(page.getByTestId("product-object-count")).toHaveText("0");
  await expect(thread.getByText("Change undone")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("product-object-count")).toHaveText("0");
});

test("adds an intentional background circle behind unchanged sticky notes", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByLabel("AI authority").selectOption("edit_with_review");
  await page.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(page, { x: 420, y: 280 });

  let composer = page.getByRole("dialog", { name: "New comment" });
  let comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill(
    "Create five sticky notes labeled Red, Yellow, Orange, Green, and Blue.",
  );
  await composer.getByRole("button", { name: "Submit comment" }).click();
  let thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
  await thread.getByRole("button", { name: "Close comment thread" }).click();

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(page, { x: 760, y: 560 });
  composer = page.getByRole("dialog", { name: "New comment" });
  comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill(
    "Please add a large grey circle behind the sticks, make sure the stickies don't move but all are inside the grey circle.",
  );
  await composer.getByRole("button", { name: "Submit comment" }).click();

  thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByText(
      "I added a large grey circle behind the sticky notes without moving them.",
    ),
  ).toBeVisible();
  await expect(thread.getByText("AI response failed")).toHaveCount(0);
  await expect(page.getByTestId("product-object-count")).toHaveText("6");
  await thread.getByRole("button", { name: "Undo AI change" }).click();
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
});

test("canvas undo reverses the latest AI transaction", async ({ page }) => {
  await openFreshCanvas(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByLabel("AI authority").selectOption("edit_with_review");
  await page.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(page, { x: 420, y: 280 });

  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill(
    "Create five sticky notes labeled Red, Yellow, Orange, Green, and Blue.",
  );
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByRole("button", { name: "Undo AI change" }),
  ).toBeVisible();
  await expect(page.getByTestId("product-object-count")).toHaveText("5");
  await thread.getByRole("button", { name: "Close comment thread" }).click();
  const surface = page.getByTestId("product-canvas-surface");
  await surface.focus();
  await surface.press("Meta+z");
  await expect(page.getByTestId("product-object-count")).toHaveText("0");
});

test("uses an ordinary inherited reply for an AI revision", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.locator('[data-testid^="object-list-item-"]').first().click();
  const positionBefore = Number(
    await page.getByTestId("selected-position-x").textContent(),
  );

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByLabel("AI authority").selectOption("edit_with_review");
  await page.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Review moving this object to the right.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  const aiReply = thread.getByText(
    "I made the requested change on the canvas.",
  );
  await expect(aiReply).toHaveCount(1);
  await thread
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill("Please revise it by moving it to the right again.");
  await thread.getByRole("button", { name: "Send reply" }).click();
  await expect(aiReply).toHaveCount(2);
  await expect(
    thread.getByRole("button", { name: "Undo AI change" }),
  ).toHaveCount(2);
  await expect(
    thread.getByRole("button", { name: "Request revision" }),
  ).toHaveCount(0);
  await thread.getByRole("button", { name: "Close comment thread" }).click();
  await page.getByRole("button", { name: "Open Object navigator" }).click();
  await page.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(page.getByTestId("selected-position-x")).toHaveText(
    String(positionBefore + 80),
  );
});

test("AI undo preserves a later same-field collaborator edit", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();

  await openFreshCanvas(owner);
  await addRectangle(owner);
  const canvasId = owner.url().split("/").at(-1);
  if (!canvasId) throw new Error("The fresh canvas ID is unavailable.");
  await addEditorMembership(canvasId);
  await signIn(editor, "editor@thinking-canvas.local");
  await editor.goto(`/app/canvases/${canvasId}`);
  await expect(editor.getByTestId("product-object-count")).toHaveText("1");

  await owner.getByRole("button", { name: "Open Object navigator" }).click();
  await owner.locator('[data-testid^="object-list-item-"]').first().click();
  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await owner.getByLabel("AI authority").selectOption("edit_with_review");
  await owner.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(owner);
  const composer = owner.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Review moving this object to the right.");
  await composer.getByRole("button", { name: "Submit comment" }).click();
  const ownerThread = owner.getByRole("dialog", { name: "Comment thread" });
  await expect(
    ownerThread.getByRole("button", { name: "Undo AI change" }),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Open Object navigator" }).click();
  await editor.locator('[data-testid^="object-list-item-"]').first().click();
  const aiPosition = Number(
    await editor.getByTestId("selected-position-x").textContent(),
  );
  await editor.getByTestId("product-canvas-surface").focus();
  await editor.getByTestId("product-canvas-surface").press("ArrowRight");

  await ownerThread.getByRole("button", { name: "Undo AI change" }).click();
  await expect(
    ownerThread.getByText(
      "Change undone where safe; 1 later edit was preserved.",
    ),
  ).toBeVisible();
  await ownerThread
    .getByRole("button", { name: "Close comment thread" })
    .click();
  await owner.getByRole("button", { name: "Open Object navigator" }).click();
  await owner.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(owner.getByTestId("selected-position-x")).toHaveText(
    String(aiPosition + 1),
  );
  await expect(editor.getByTestId("selected-position-x")).toHaveText(
    String(aiPosition + 1),
  );

  await ownerContext.close();
  await editorContext.close();
});

test("AI undo restores its label while preserving a collaborator move", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();

  await openFreshCanvas(owner);
  await addRectangle(owner);
  const canvasId = owner.url().split("/").at(-1);
  if (!canvasId) throw new Error("The fresh canvas ID is unavailable.");
  await addEditorMembership(canvasId);
  await signIn(editor, "editor@thinking-canvas.local");
  await editor.goto(`/app/canvases/${canvasId}`);
  await expect(editor.getByTestId("product-object-count")).toHaveText("1");

  await owner.getByRole("button", { name: "Open Object navigator" }).click();
  await owner.locator('[data-testid^="object-list-item-"]').first().click();
  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await owner.getByLabel("AI authority").selectOption("edit_with_review");
  await owner.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(owner);
  const composer = owner.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Review changing this object's label.");
  await composer.getByRole("button", { name: "Submit comment" }).click();
  const ownerThread = owner.getByRole("dialog", { name: "Comment thread" });
  await expect(
    ownerThread.getByRole("button", { name: "Undo AI change" }),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Open Object navigator" }).click();
  await editor.locator('[data-testid^="object-list-item-"]').first().click();
  const positionBeforeMove = Number(
    await editor.getByTestId("selected-position-x").textContent(),
  );
  await expect(
    editor.getByRole("button", { name: /Supporting evidence/ }).first(),
  ).toBeVisible();
  await editor.getByTestId("product-canvas-surface").focus();
  await editor.getByTestId("product-canvas-surface").press("ArrowRight");

  await ownerThread.getByRole("button", { name: "Undo AI change" }).click();
  await expect(ownerThread.getByText("Change undone")).toBeVisible();
  await ownerThread
    .getByRole("button", { name: "Close comment thread" })
    .click();
  await owner.getByRole("button", { name: "Open Object navigator" }).click();
  await owner.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(
    owner.getByRole("button", { name: /New idea/ }).first(),
  ).toBeVisible();
  await expect(owner.getByTestId("selected-position-x")).toHaveText(
    String(positionBeforeMove + 1),
  );

  await editor.reload();
  await editor.getByRole("button", { name: "Open Object navigator" }).click();
  await editor.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(
    editor.getByRole("button", { name: /New idea/ }).first(),
  ).toBeVisible();
  await expect(editor.getByTestId("selected-position-x")).toHaveText(
    String(positionBeforeMove + 1),
  );

  await ownerContext.close();
  await editorContext.close();
});

test("applies a trusted AI canvas command and converges it in two authenticated contexts", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  const requestBody = `Apply this trusted edit for both collaborators ${Date.now()}.`;

  await openFreshCanvas(owner);
  await addRectangle(owner);
  const canvasId = owner.url().split("/").at(-1);
  if (!canvasId) throw new Error("The fresh canvas ID is unavailable.");
  await addEditorMembership(canvasId);

  await owner.getByRole("button", { name: "Open Object navigator" }).click();
  await owner.locator('[data-testid^="object-list-item-"]').first().click();
  const positionBefore = Number(
    await owner.getByTestId("selected-position-x").textContent(),
  );
  expect(Number.isFinite(positionBefore)).toBe(true);

  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await owner.getByLabel("AI authority").selectOption("trusted_editor");
  const enabled = owner.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();

  await signIn(editor, "editor@thinking-canvas.local");
  await editor.goto(`/app/canvases/${canvasId}`);
  await expect(editor.getByTestId("product-object-count")).toHaveText("1");

  await placeArmedComment(owner);
  const composer = owner.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill(requestBody);
  const runResponse = owner.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/canvases/${canvasId}/ai/runs`),
  );
  await composer.getByRole("button", { name: "Submit comment" }).click();
  const runEvents = await (await runResponse).text();
  expect(runEvents).toContain('"status":"completed"');

  const ownerThread = owner.getByRole("dialog", { name: "Comment thread" });
  await expect(
    ownerThread.getByText(
      "I applied validated canvas changes as the primary AI collaborator.",
    ),
  ).toBeVisible();
  await expect(
    ownerThread.getByText(
      "The change is on the canvas. You can undo it if needed.",
    ),
  ).toBeVisible();
  await ownerThread
    .getByRole("button", { name: "Close comment thread" })
    .click();

  await owner.getByRole("button", { name: "Open Object navigator" }).click();
  await owner.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(owner.getByTestId("selected-position-x")).toHaveText(
    String(positionBefore + 40),
  );

  await editor.getByRole("button", { name: "Open Object navigator" }).click();
  await editor.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(editor.getByTestId("selected-position-x")).toHaveText(
    String(positionBefore + 40),
  );

  await editor.reload();
  await editor.getByRole("button", { name: "Open Object navigator" }).click();
  await editor.locator('[data-testid^="object-list-item-"]').first().click();
  await expect(editor.getByTestId("selected-position-x")).toHaveText(
    String(positionBefore + 40),
  );

  await editorContext.close();
  await ownerContext.close();
});

test("cancels and retries an AI response inline in its comment thread", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Inspect this, but let me control the run.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  const cancel = thread.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeVisible();
  await expectFilledReadableHover(page, cancel);
  await cancel.click();
  await expect(thread.getByText("AI response cancelled")).toBeVisible();
  const retry = thread.getByRole("button", { name: "Retry", exact: true });
  await expectFilledReadableHover(page, retry);
  await retry.click();
  await expect(thread.getByText(/Thinking Canvas AI is/)).toBeVisible();
  await expect(
    thread.getByText(
      "I inspected 1 canvas objects and 1 comment conversations.",
    ),
  ).toBeVisible();
  await expect(thread.getByText("AI response cancelled")).not.toBeVisible();
  await expectFilledReadableHover(
    page,
    thread.getByRole("button", { name: "Resolve", exact: true }),
  );
});

test("shows a failed AI response inline and retries without duplicating the comment", async ({
  page,
}) => {
  let failNextRun = true;
  await page.route("**/api/canvases/*/ai/runs", async (route) => {
    if (route.request().method() === "POST" && failNextRun) {
      failNextRun = false;
      await route.continue({
        headers: {
          ...route.request().headers(),
          "x-thinking-canvas-test-scenario": "failed",
        },
      });
      return;
    }
    await route.continue();
  });
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Keep this comment even if the response fails.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(thread.getByText("AI response failed")).toBeVisible();
  await expect(
    thread.getByText("Keep this comment even if the response fails."),
  ).toHaveCount(1);
  await thread.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    thread.getByText(
      "I inspected 1 canvas objects and 1 comment conversations.",
    ),
  ).toBeVisible();
  await expect(thread.getByText("AI response failed")).not.toBeVisible();
  await expect(
    thread.getByText("Keep this comment even if the response fails."),
  ).toHaveCount(1);
});

test("filters human collaborators and redirects inherited recipients to humans and AI", async ({
  page,
}) => {
  await signIn(page, "owner@thinking-canvas.local");
  await page.goto(`/app/canvases/${seedCanvasId}`);
  await expect(page.getByTestId("product-canvas-surface")).toBeVisible();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "Hide markers" }).click();
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  if (!(await enabled.isChecked())) {
    await enabled.click();
    await expect(enabled).toBeChecked();
  }
  await placeArmedComment(page, { x: 760, y: 520 });
  const composer = page.getByRole("dialog", { name: "New comment" });
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@edi");
  await expect(
    composer.getByRole("option", { name: /Editor Example editor/ }),
  ).toBeVisible();
  await expect(
    composer.getByRole("option", { name: /Commenter Example commenter/ }),
  ).not.toBeVisible();
  await composer.getByRole("option", { name: /Editor Example editor/ }).click();
  await comment.fill("Please review this direction.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByRole("button", { name: "Remove Editor Example" }),
  ).toHaveCount(0);
  await expect(thread.getByText("To (inherited)")).toHaveCount(0);
  const reply = thread.getByRole("textbox", { name: "Reply", exact: true });
  await reply.fill("@com");
  await thread
    .getByRole("option", { name: /Commenter Example commenter/ })
    .click();
  await reply.fill("Handing this conversation to another collaborator @");
  await thread
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await reply.fill(
    "Handing this conversation to another collaborator and the AI.",
  );
  await thread.getByRole("button", { name: "Send reply" }).click();

  await expect(
    thread.getByRole("button", { name: "Remove Commenter Example" }),
  ).toBeVisible();
  await expect(
    thread.getByRole("button", { name: "Remove Thinking Canvas AI" }),
  ).toBeVisible();
  await expect(
    thread.getByText(
      /I inspected \d+ canvas objects and \d+ comment conversations\./,
    ),
  ).toBeVisible();
});

test("captures a connected selection as ordered AI path context", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Ellipse", exact: true })
    .click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 650, y: 280 } });
  await page.getByRole("button", { name: "Connector", exact: true }).click();
  const surface = page.getByTestId("product-canvas-surface");
  await surface.click({ position: { x: 500, y: 330 } });
  await surface.click({ position: { x: 730, y: 330 } });
  await expect(page.getByTestId("product-object-count")).toHaveText("3");

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await surface.click({ position: { x: 500, y: 330 } });
  await surface.click({
    position: { x: 730, y: 330 },
    modifiers: ["Shift"],
  });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  await enabled.click();
  await expect(enabled).toBeChecked();
  await placeArmedComment(page, { x: 500, y: 330 });
  const composer = page.getByRole("dialog", { name: "New comment" });
  await expect(
    composer.getByText("AI path context: 2 objects in selection order"),
  ).toBeVisible();
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Interpret this connected path in order.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByText(
      /I inspected 2 selected path objects in order: rectangle: New idea → ellipse: New idea\./,
    ),
  ).toBeVisible();
});

test("keeps an unconnected ordered-path request and reports the path error inline", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Ellipse", exact: true })
    .click();
  const surface = page.getByTestId("product-canvas-surface");
  await surface.click({ position: { x: 650, y: 280 } });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await surface.click({ position: { x: 500, y: 330 } });
  await surface.click({
    position: { x: 730, y: 330 },
    modifiers: ["Shift"],
  });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("checkbox", { name: "Enabled" }).click();
  await placeArmedComment(page, { x: 500, y: 330 });
  const composer = page.getByRole("dialog", { name: "New comment" });
  await expect(
    composer.getByText("AI path context: 2 objects in selection order"),
  ).toBeVisible();
  const comment = composer.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await comment.fill("@");
  await composer
    .getByRole("option", { name: /Thinking Canvas AI Primary AI/ })
    .click();
  await comment.fill("Inspect this sequence without changing the canvas.");
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(
    thread.getByText("Inspect this sequence without changing the canvas."),
  ).toBeVisible();
  await expect(
    thread.getByText("The selected path is not connected in selection order."),
  ).toBeVisible();
  await expect(page.getByTestId("product-object-count")).toHaveText("2");
});

test("anchors one thread to a complete group and preserves it after target deletion", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Ellipse", exact: true })
    .click();
  await page
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 650, y: 280 } });
  await expect(page.getByTestId("product-object-count")).toHaveText("2");

  await page.getByRole("button", { name: "Open Object navigator" }).click();
  const objects = page.locator('[data-testid^="object-list-item-"]');
  await objects.first().click();
  await objects.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");
  await page.getByRole("button", { name: "More selection actions" }).click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(page);
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("This feedback belongs to the whole group.");
  await composer.getByRole("button", { name: "Submit comment" }).click();
  await page
    .getByRole("dialog", { name: "Comment thread" })
    .getByRole("button", { name: "Close comment thread" })
    .click();
  const marker = page.getByRole("button", { name: /Open comment by/ });
  const markerBefore = await marker.boundingBox();

  await page.getByRole("button", { name: "Select", exact: true }).click();
  const surface = page.getByTestId("product-canvas-surface");
  await surface.focus();
  await surface.press("Control+a");
  await expect(page.getByTestId("selection-status")).toHaveText("2 selected");

  await surface.press("ArrowRight");
  await expect
    .poll(async () => (await marker.boundingBox())?.x)
    .toBeGreaterThan(markerBefore?.x ?? 0);

  await surface.press("Delete");
  await expect(page.getByTestId("product-object-count")).toHaveText("0");
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("Target unavailable")).toBeVisible();
  await page
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", {
      name: /This feedback belongs to the whole group\./,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("This feedback belongs to the whole group.");

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("Target unavailable")).toBeVisible();
});

test("renders review and fixed rating controls and preserves closed history", async ({
  page,
}) => {
  await openFreshCanvas(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "Comments", exact: true }).click();

  async function createPrompt(body: string, kind: "review" | "rating") {
    const commentsPanel = page.getByRole("dialog", { name: "Comments" });
    if (await commentsPanel.isHidden()) {
      await page.getByRole("button", { name: "Comments", exact: true }).click();
    }
    const placement = page.getByRole("button", {
      name: "Place comment on canvas",
    });
    if (await placement.isHidden()) {
      await page.getByRole("button", { name: "New comment" }).click();
    }
    await placeArmedComment(page);
    const composer = page.getByRole("dialog", { name: "New comment" });
    await composer
      .getByRole("textbox", { name: "Comment", exact: true })
      .fill(body);
    await composer.getByLabel("Prompt").selectOption(kind);
    await composer.getByRole("button", { name: "Submit comment" }).click();
    return page.getByRole("dialog", { name: "Comment thread" });
  }

  let thread = await createPrompt("Choose a review outcome.", "review");
  await thread.getByRole("button", { name: "Revise", exact: true }).click();
  await expect(
    thread.getByRole("button", { name: "Revise", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await thread.getByRole("button", { name: "Close comment thread" }).click();

  thread = await createPrompt("Rate this direction.", "rating");
  await thread.getByRole("button", { name: "5", exact: true }).click();
  await expect(
    thread.getByRole("button", { name: "5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await thread.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(thread).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open comment by/ }),
  ).toHaveCount(1);

  await page.reload();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", { name: /Rate this direction\./ })
    .last()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Comment thread" }),
  ).toContainText("Rating (1–5)");
});

test("broadcasts comment changes between canvas members", async ({
  browser,
}) => {
  const threadBody = `Realtime feedback ${Date.now()} is visible to collaborators.`;
  const replyBody = `Editor reply ${Date.now()} arrived live.`;
  const promptBody = `Shared prompt response ${Date.now()} converged.`;
  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  await signIn(owner, "owner@thinking-canvas.local");
  await signIn(editor, "editor@thinking-canvas.local");
  await Promise.all([
    owner.goto(`/app/canvases/${seedCanvasId}`),
    editor.goto(`/app/canvases/${seedCanvasId}`),
  ]);

  await expect(owner.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect(editor.getByTestId("canvas-save-status")).toHaveText("Saved");
  await expect
    .poll(async () => {
      const ownerValue = await owner
        .getByTestId("product-object-count")
        .textContent();
      const editorValue = await editor
        .getByTestId("product-object-count")
        .textContent();
      return ownerValue === editorValue;
    })
    .toBe(true);
  const ownerCount = Number(
    await owner.getByTestId("product-object-count").textContent(),
  );
  await owner.getByRole("button", { name: "Shapes", exact: true }).click();
  await owner
    .getByRole("menuitemradio", { name: "Rectangle", exact: true })
    .click();
  await owner
    .getByTestId("product-canvas-surface")
    .click({ position: { x: 520, y: 360 } });
  await expect(owner.getByTestId("product-object-count")).toHaveText(
    String(ownerCount + 1),
  );
  await expect(editor.getByTestId("product-object-count")).toHaveText(
    String(ownerCount + 1),
  );

  await editor.getByRole("button", { name: "Comments", exact: true }).click();
  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(owner, { x: 520, y: 360 });
  const composer = owner.getByRole("dialog", { name: "New comment" });
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill(threadBody);
  await composer.getByRole("button", { name: "Submit comment" }).click();

  const editorThreadListItem = editor
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", { name: new RegExp(threadBody) });
  await expect(editorThreadListItem).toBeVisible();
  await editorThreadListItem.click();
  const editorThread = editor.getByRole("dialog", { name: "Comment thread" });
  await expect(editorThread.getByLabel("Prompt")).not.toBeVisible();
  await expect(
    editorThread.getByRole("button", { name: "Edit initial comment" }),
  ).not.toBeVisible();
  await editorThread
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill(replyBody);
  await editorThread.getByRole("button", { name: "Send reply" }).click();
  await expect(editorThread.getByText(replyBody)).toBeVisible();
  await expect(owner.getByText(replyBody)).toBeVisible();

  await editorThread
    .getByRole("button", { name: "Close comment thread" })
    .click();
  await owner
    .getByRole("dialog", { name: "Comment thread" })
    .getByRole("button", { name: "Close comment thread" })
    .click();
  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await placeArmedComment(owner, { x: 620, y: 420 });
  const promptComposer = owner.getByRole("dialog", { name: "New comment" });
  await promptComposer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill(promptBody);
  await promptComposer.getByLabel("Prompt").selectOption("yes_no");
  await promptComposer.getByRole("button", { name: "Submit comment" }).click();

  const ownerPromptThread = owner.getByRole("dialog", {
    name: "Comment thread",
  });
  await editor.getByRole("button", { name: "Comments", exact: true }).click();
  const editorPromptListItem = editor
    .getByRole("dialog", { name: "Comments" })
    .getByRole("button", { name: new RegExp(promptBody) });
  await expect(editorPromptListItem).toBeVisible();
  await editorPromptListItem.click();
  const editorPromptThread = editor.getByRole("dialog", {
    name: "Comment thread",
  });
  await expect(editorPromptThread.getByLabel("Prompt")).not.toBeVisible();
  await expect(
    editorPromptThread.getByRole("button", { name: "Edit initial comment" }),
  ).not.toBeVisible();
  await expect(
    editorPromptThread.getByRole("textbox", { name: "Reply" }),
  ).not.toBeVisible();
  await editorPromptThread
    .getByRole("button", { name: "Yes", exact: true })
    .click();
  await expect(
    editorPromptThread.getByRole("button", { name: "Yes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    ownerPromptThread.getByRole("button", { name: "Yes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    ownerPromptThread.getByText(/Editor Example:\s*Yes/),
  ).not.toBeVisible();

  await Promise.all([owner.reload(), editor.reload()]);
  await owner.getByRole("button", { name: "Comments", exact: true }).click();
  await editor.getByRole("button", { name: "Comments", exact: true }).click();
  for (const page of [owner, editor]) {
    await page
      .getByRole("dialog", { name: "Comments" })
      .getByRole("button", { name: new RegExp(promptBody) })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Comment thread" })
        .getByRole("button", { name: "Yes", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }

  await editorContext.close();
  await ownerContext.close();
});
