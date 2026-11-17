import { expect, test, type Page } from "@playwright/test";

// Shop by Category: only whole cards are ever shown at rest. Two side by side on phones and tablets, four on wider
// screens, in English and Arabic (where the rail runs right to left). Runs against the storefront alone: the
// homepage's built-in data fills the rail without the API.
const WIDTHS = [320, 360, 390, 430, 720, 768, 1024, 1280, 1440];
const expected = (width: number) => (width < 1024 ? 2 : 4);

async function openHome(page: Page, language: "en" | "ar") {
  await page.addInitScript((value) => window.localStorage.setItem("qleaves-language", value), language);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".home-categories li img").first().waitFor();
  await page.locator(".rail__scroller").scrollIntoViewIfNeeded();
}

function visibleCards(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".rail__scroller")!;
    const frame = scroller.getBoundingClientRect();
    let whole = 0;
    const partial: number[] = [];
    for (const card of document.querySelectorAll(".home-categories li")) {
      const box = card.getBoundingClientRect();
      const shown = Math.min(box.right, frame.right) - Math.max(box.left, frame.left);
      if (shown <= 0.5) continue;
      if (shown >= box.width - 1) whole += 1;
      else partial.push(Math.round(shown));
    }
    return { whole, partial, gliding: scroller.hasAttribute("data-gliding") };
  });
}

for (const language of ["en", "ar"] as const) {
  test.describe(`category rail (${language})`, () => {
    for (const width of WIDTHS) {
      test(`shows ${expected(width)} whole cards and no partial card at ${width}px`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: 900 });
        await openHome(page, language);
        await expect.poll(() => visibleCards(page)).toMatchObject({ whole: expected(width), partial: [] });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      });
    }

    test("comes to rest on whole cards between automatic glides", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openHome(page, language);
      const rests: Array<{ whole: number; partial: number[] }> = [];
      for (let sample = 0; sample < 40; sample += 1) {
        await page.waitForTimeout(250);
        const state = await visibleCards(page);
        if (!state.gliding) rests.push(state);
      }
      expect(rests.length).toBeGreaterThan(10);
      for (const state of rests) expect(state).toMatchObject({ whole: 2, partial: [] });
    });

    test("settles on a card edge after a scroll that stops between cards", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openHome(page, language);
      const box = (await page.locator(".rail__scroller").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(language === "ar" ? -73 : 73, 0);
      await expect.poll(() => visibleCards(page), { timeout: 3_000 }).toMatchObject({ whole: 4, partial: [] });
    });
  });
}
