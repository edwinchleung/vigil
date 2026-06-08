import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("home loads hero and CTA", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /inbox that filters noise/i,
      }),
    ).toBeVisible();
  });

  test("sign-in page offers OAuth choices", async ({ page }) => {
    await page.goto("/signin");
    // CardTitle is a styled div, not a native heading — match visible copy.
    await expect(page.getByText(/welcome to vigil/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with microsoft/i })).toBeVisible();
  });
});
