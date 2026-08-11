import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the foundation shell without detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "A durable place to think together." }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
