import { expect, test, type Page } from "@playwright/test";

// Product photographs change by themselves, by crossfade, without the customer scrolling, on cards and on the
// product page. The storefront runs alone here; the API answers below are fixed so the products and their photos
// are known (the photos are real files in apps/web/public/media/plants).
const photo = (base: string, sortOrder: number) => [
  { url: `/media/plants/${base}-640.webp`, altText: "Corn plant", width: 640, height: 640, purpose: "catalog", sortOrder },
  { url: `/media/plants/${base}-1024.webp`, altText: "Corn plant", width: 1024, height: 1024, purpose: "detail", sortOrder: sortOrder + 1 },
];
const product = (slug: string, name: string, media: ReturnType<typeof photo>) => ({
  id: slug, slug, name, nameAr: null, description: "A plant used in tests.", descriptionAr: null, category: "Indoor Plants", categoryAr: "نباتات داخلية",
  light: null, lightAr: null, priceQar: 99, compareAtPriceQar: null, featured: false, scientificName: null, searchAliases: null, careLevel: "easy",
  placement: "indoor", watering: null, wateringAr: null, stock: 5, inStock: true, createdAt: "2026-11-10T00:00:00.000Z", image: media[0] ?? null, media,
});
const three = product("three-photos", "Three Photos", [...photo("corn-plant", 0), ...photo("corn-plant-2", 2), ...photo("corn-plant-3", 4)]);
const two = product("two-photos", "Two Photos", [...photo("aloe-vera-v2", 0), ...photo("aloe-vera-v2-2", 2)].map((item) => ({ ...item, url: item.url.replace("-1024", item.purpose === "detail" ? "-1024" : "-640") })));
const one = product("one-photo", "One Photo", photo("corn-plant", 0));
const catalogue = { version: "2026-11-17T00:00:00.000Z", generatedAt: "2026-11-17T00:00:00.000Z", productCount: 3, products: [three, two, one] };

async function serveProducts(page: Page) {
  await page.route("**/api/v1/catalogue", (route) => route.fulfill({ json: catalogue }));
  await page.route("**/catalogue/catalogue.json", (route) => route.fulfill({ json: catalogue }));
  await page.route("**/api/v1/products?**", (route) => route.fulfill({ json: { items: catalogue.products, page: 1, pageSize: 24, totalItems: 3, totalPages: 1 } }));
  await page.route("**/api/v1/products/filters**", (route) => route.fulfill({ json: { categories: ["Indoor Plants"], lights: [], categoryCounts: { "Indoor Plants": 3 } } }));
  await page.route(/\/api\/v1\/products\/(three-photos|two-photos|one-photo)/, (route) => {
    const slug = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ json: catalogue.products.find((item) => item.slug === slug) });
  });
}

const card = (page: Page, slug: string) => page.locator(".product-card").filter({ has: page.getByTestId(`view-${slug}`) });

for (const language of ["en", "ar"] as const) {
  test.describe(`product photos (${language})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem("qleaves-language", value), language);
      await serveProducts(page);
    });

    test("a card on screen changes photograph by itself, by crossfade, with no blank frame and no movement", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/shop", { waitUntil: "domcontentloaded" });
      const slideshow = card(page, "three-photos").locator("[data-photos]");
      // The first visit can wait on the test server compiling the page.
      await expect(slideshow).toHaveAttribute("data-photos", "3", { timeout: 20_000 });
      const boxBefore = await slideshow.boundingBox();
      const frames = await slideshow.evaluate((element) => new Promise<Array<{ photo: string | null; opacities: number[] }>>((resolve) => {
        const out: Array<{ photo: string | null; opacities: number[] }> = [];
        const start = performance.now();
        const sample = () => {
          const box = element.querySelector(".photo-crossfade")!;
          out.push({ photo: box.getAttribute("data-photo"), opacities: [...box.querySelectorAll(".photo-crossfade__layer")].map((layer) => Number(getComputedStyle(layer).opacity)) });
          if (performance.now() - start < 7_000) requestAnimationFrame(sample); else resolve(out);
        };
        requestAnimationFrame(sample);
      }));
      expect(new Set(frames.map((frame) => frame.photo)).size).toBeGreaterThan(1);
      // During a change both photographs are on screen, the new one part-way faded in, the old one fully shown.
      expect(frames.some((frame) => frame.opacities.length === 2 && frame.opacities[0] === 1 && frame.opacities[1] > 0.1 && frame.opacities[1] < 0.9)).toBe(true);
      expect(frames.every((frame) => frame.opacities.some((value) => value >= 0.99))).toBe(true);
      expect(await slideshow.boundingBox()).toEqual(boxBefore);
    });

    test("uses each product's own number of photographs, and none twice", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/shop", { waitUntil: "domcontentloaded" });
      await expect(card(page, "two-photos").locator("[data-photos]")).toHaveAttribute("data-photos", "2", { timeout: 20_000 });
      await expect(card(page, "one-photo").locator("[data-photos]")).toHaveCount(0);
      await expect(card(page, "one-photo").locator("img")).toHaveCount(1);
    });

    test("the product page plays by itself and lets the customer choose a photograph", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/plants/three-photos", { waitUntil: "domcontentloaded" });
      const thumbs = page.locator(".product-gallery__thumb");
      await expect(thumbs).toHaveCount(3, { timeout: 20_000 });
      await expect(thumbs.nth(0)).toHaveAttribute("aria-pressed", "true");
      // The first automatic change comes 3 to 6 seconds after the photo is on screen.
      await expect(thumbs.nth(1)).toHaveAttribute("aria-pressed", "true", { timeout: 12_000 });
      await thumbs.nth(2).click();
      await expect(thumbs.nth(2)).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(7_000);
      await expect(thumbs.nth(2)).toHaveAttribute("aria-pressed", "true"); // the customer's choice holds
      await page.locator(".product-gallery__step").first().click();
      await expect(thumbs.nth(1)).toHaveAttribute("aria-pressed", "true");
    });

    test("stays on the first photograph for visitors who asked for reduced motion", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/shop", { waitUntil: "domcontentloaded" });
      const box = card(page, "three-photos").locator(".photo-crossfade");
      await expect(box).toHaveAttribute("data-photo", "0", { timeout: 20_000 });
      await page.waitForTimeout(7_000);
      await expect(box).toHaveAttribute("data-photo", "0");
    });
  });
}
