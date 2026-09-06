import { expect, test } from "@playwright/test";

test("paper labels stay inside the safe outer area of each torn half", async ({ page }) => {
  await page.goto("/");
  const viewportWidth = page.viewportSize()!.width;
  const leftCopy = await page.getByText("Handle with care", { exact: true }).boundingBox();
  const rightCopy = await page.getByText("Plants · Home · Warmth", { exact: true }).boundingBox();

  expect(leftCopy).not.toBeNull();
  expect(rightCopy).not.toBeNull();
  expect(leftCopy!.x + leftCopy!.width).toBeLessThanOrEqual(viewportWidth * 0.46);
  expect(rightCopy!.x).toBeGreaterThanOrEqual(viewportWidth * 0.54);
});

for (const path of ["/", "/shop", "/cart", "/checkout", "/privacy", "/terms", "/shipping-returns", "/admin/login"]) {
  test(`${path} has no page-level horizontal overflow in either language`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const overflow = () => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    await expect.poll(overflow).toBeLessThanOrEqual(0);
    await page.evaluate(() => window.localStorage.setItem("qleaves-language", "ar"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect.poll(overflow).toBeLessThanOrEqual(0);
  });
}
