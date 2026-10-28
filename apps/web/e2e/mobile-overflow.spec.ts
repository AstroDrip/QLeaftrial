import { expect, test } from "@playwright/test";

for (const path of ["/", "/shop", "/plants/areca-palm-110-cm", "/cart", "/checkout", "/about", "/privacy", "/terms", "/shipping-returns", "/admin/login"]) {
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
