import { expect, test, type Page } from "@playwright/test";

const syntheticOwner = {
  email: "owner@thinking-canvas.local",
  password: "LocalPassword1!",
  id: "10000000-0000-4000-8000-000000000001",
};

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(syntheticOwner.email);
  await page.getByLabel("Password").fill(syntheticOwner.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Your canvas workspace" }),
  ).toBeVisible();
}

test.describe("Supabase Auth boundary", () => {
  test("protects routes across sign-in and sign-out", async ({ page }) => {
    await page.goto("/app");

    await expect(page).toHaveURL(/\/auth\/sign-in\?reason=session-required$/);
    await expect(page.getByRole("status")).toHaveText(
      "Sign in to continue to the protected workspace.",
    );

    await page.getByLabel("Email").fill(syntheticOwner.email);
    await page.getByLabel("Password").fill(syntheticOwner.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(syntheticOwner.email)).toBeVisible();

    await page.goto("/spikes");
    await expect(
      page.getByRole("heading", { name: "Architecture spike workspace" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in\?reason=signed-out$/);
    await expect(page.getByRole("status")).toHaveText(
      "You have been signed out.",
    );

    await page.goto("/spikes");
    await expect(page).toHaveURL(/\/auth\/sign-in\?reason=session-required$/);
  });

  test("returns an expired, unrefreshable session to sign-in", async ({
    context,
    page,
  }) => {
    await signIn(page);

    const authCookie = (await context.cookies()).find((cookie) =>
      cookie.name.includes("auth-token"),
    );
    expect(authCookie).toBeDefined();

    const cookieName = authCookie!.name.replace(/\.\d+$/, "");
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const expiredAccessToken = [
      encode({ alg: "HS256", typ: "JWT" }),
      encode({
        sub: syntheticOwner.id,
        email: syntheticOwner.email,
        role: "authenticated",
        exp: 1,
      }),
      "expired-signature",
    ].join(".");
    const expiredSession = {
      access_token: expiredAccessToken,
      refresh_token: "invalid-refresh-token",
      expires_in: 1,
      expires_at: 1,
      token_type: "bearer",
      user: {
        id: syntheticOwner.id,
        email: syntheticOwner.email,
        aud: "authenticated",
        role: "authenticated",
      },
    };

    await context.clearCookies({ name: /auth-token/ });
    await context.addCookies([
      {
        name: cookieName,
        value: `base64-${encode(expiredSession)}`,
        url: "http://localhost:3000",
        sameSite: "Lax",
      },
    ]);

    await page.goto("/spikes");

    await expect(page).toHaveURL(/\/auth\/sign-in\?reason=session-required$/);
    await expect(page.getByRole("status")).toHaveText(
      "Sign in to continue to the protected workspace.",
    );
  });
});
