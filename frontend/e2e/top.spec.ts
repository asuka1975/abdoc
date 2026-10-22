import { expect, test } from "@playwright/test";

test("トップページに ABDOC が表示される", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("ABDOC");
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC" })).toBeVisible();
});
