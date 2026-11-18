import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Customer and admin journeys from the brief, against the test API (apps/api/scripts/e2e-server.ts): its own
// throwaway database, test-only admin password, fake email that hangs like a slow provider, in-memory photo storage.
// Journeys 3-9 are in category-rail.spec.ts and product-photos.spec.ts; 15 is also covered by mobile-overflow.spec.ts.
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "taimuomar"; // the local development seed's test password
const overlapAudit = readFileSync(join(__dirname, "../../../scripts/overlap-audit.js"), "utf8");
const KNOWN_LAYERS = /site-header x main-content|home-stage/;

const listAnswer = (page: Page, has = "") => page.waitForResponse((response) => /\/api\/v1\/products\?/.test(response.url()) && response.url().includes(has) && response.ok());
const cardNames = (page: Page) => page.locator("[data-testid=product-grid] .product-card__name").allTextContents();

async function adminRequest(request: APIRequestContext) {
  const login = await request.post("/api/v1/auth/login", { data: { password: ADMIN_PASSWORD } });
  expect(login.ok()).toBe(true);
  return request;
}

async function audit(page: Page) {
  const found = await page.evaluate((source) => { console.table = () => undefined; return (0, eval)(source) as string[]; }, overlapAudit);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { overlaps: found.filter((entry) => !KNOWN_LAYERS.test(entry)), overflow };
}

/** Checkout with one test plant in the cart, the delivery spot chosen on the map and the contact details typed. */
async function readyCheckout(page: Page, request: APIRequestContext, phone: string) {
  const plant = await (await request.get("/api/v1/products/e2e-plant-004")).json();
  await page.addInitScript((item) => {
    if (sessionStorage.getItem("cart-seeded")) return;
    localStorage.setItem("qleaves-cart", JSON.stringify({ state: { items: [item] }, version: 0 }));
    sessionStorage.setItem("cart-seeded", "1");
  }, { id: plant.id, slug: plant.slug, name: plant.name, priceQar: plant.priceQar, stock: plant.stock, image: plant.image, quantity: 1 });
  await page.goto("/checkout");
  await page.locator("[data-testid=location-picker]").scrollIntoViewIfNeeded();
  await page.waitForSelector(".qatar-map[data-state=ready]", { timeout: 45_000 });
  const search = page.locator("[data-testid=location-picker] input[role=combobox]");
  await search.click();
  await search.pressSequentially("Lusail", { delay: 25 });
  await page.waitForSelector(".location-picker__results li");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".location-picker__selected", { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const fields = page.locator(".location-picker__field input");
  await fields.nth(1).fill("69");
  await fields.nth(3).fill("21");
  await page.click(".location-picker__confirm-button");
  await page.fill("input[name=name]", "Journey Test");
  await page.fill("input[name=phone]", phone);
  await page.fill("input[name=email]", "journey@example.test");
}

async function ordersFor(request: APIRequestContext, phone: string) {
  const admin = await adminRequest(request);
  const answer = await admin.get(`/api/v1/admin/orders?page=1&tab=PENDING&q=${encodeURIComponent(phone)}`);
  return (await answer.json()).items as Array<{ id: string; orderNumber: string; invoiceToken: string; notifications?: Array<{ status: string; lastErrorCode: string | null }> }>;
}

const uniquePhone = () => `+9745${String(Date.now()).slice(-7)}`;

test.describe("storefront without a working API", () => {
  test("1. the homepage shows categories and plants at once while the API is slow", async ({ page }) => {
    await page.route("**/api/**", async (route) => { await new Promise((resolve) => setTimeout(resolve, 15_000)); await route.continue().catch(() => undefined); });
    const started = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".product-card").first()).toBeVisible({ timeout: 4_000 });
    await expect(page.locator(".home-categories li").first()).toBeVisible();
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  test("2. the homepage still works when the API fails", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: { error: { code: "DATABASE_UNAVAILABLE", message: "down" } } }));
    await page.goto("/");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await expect(page.locator(".home-categories li").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/DATABASE_UNAVAILABLE|503|req_/);
    expect(errors).toEqual([]);
  });
});

test.describe("catalogue", () => {
  test("10. Plant Care shows each filled-in item with its icon, in English and Arabic, and leaves out empty ones", async ({ page }) => {
    await page.goto("/plants/e2e-care-fern");
    const care = page.getByTestId("plant-care");
    await expect(care.getByRole("heading", { name: "Plant care" })).toBeVisible();
    await expect(care.locator(".plant-care__item")).toHaveCount(7);
    await expect(care.locator(".plant-care__icon svg")).toHaveCount(7);
    await expect(care).toContainText("Likes humid air");
    await expect(care).toContainText("18 to 28 °C");

    await page.goto("/plants/e2e-plant-002");
    await expect(page.getByTestId("plant-care").locator(".plant-care__item dt")).toHaveText(["Light", "Care", "Placement"]);

    await page.evaluate(() => localStorage.setItem("qleaves-language", "ar"));
    await page.goto("/plants/e2e-care-fern");
    await expect(page.getByTestId("plant-care")).toContainText("يحب الهواء الرطب");
    await expect(page.getByTestId("plant-care").getByRole("heading", { name: "العناية بالنبات" })).toBeVisible();
  });

  test("11. outdoor and large plants: filters, heights on cards, size and delivery facts", async ({ page }) => {
    const answer = listAnswer(page);
    await page.goto("/shop?category=Outdoor%20Plants&size=large");
    const items = (await (await answer).json()).items as Array<{ slug: string; heightCm: number; category: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.heightCm >= 120 && item.category === "Outdoor Plants")).toBe(true);
    await expect(page.getByTestId("size-filter")).toHaveValue("large");
    await expect(page.locator(".product-card__size").first()).toContainText(/About \d+ cm tall/);
    expect(items.map((item) => item.slug)).toContain("e2e-outdoor-palm");

    await page.goto("/plants/e2e-outdoor-palm");
    const facts = page.locator(".product-detail__facts");
    await expect(facts.locator("[data-fact=height]")).toContainText("About 150 cm with the pot");
    await expect(facts.locator("[data-fact=pot]")).toContainText("Not included");
    await expect(facts.locator("[data-fact=handling]")).toContainText("Delivered upright by two people");
  });

  test("12. search and filters narrow the plants", async ({ page }) => {
    let answer = listAnswer(page);
    await page.goto("/shop");
    await answer;
    answer = listAnswer(page, "q=E2E");
    await page.getByTestId("search-input").fill("E2E Plant 01");
    await page.getByTestId("search-submit").click();
    const found = (await (await answer).json()).items as Array<{ name: string }>;
    expect(found.length).toBeGreaterThan(0);
    // The ten "E2E Plant 01x" plants are all found.
    const names = found.map((item) => item.name);
    for (let n = 10; n <= 19; n += 1) expect(names).toContain(`E2E Plant 0${n}`);
    await expect.poll(async () => (await cardNames(page))[0]).toBe(found[0].name);

    // Clearing shows the full list again (already loaded, so answered from memory).
    await page.getByTestId("clear-filters").click();
    await expect(page.getByTestId("search-input")).toHaveValue("");
    answer = listAnswer(page, "light=Full");
    await page.getByTestId("light-filter").selectOption("Full sun");
    const sunny = (await (await answer).json()).items as Array<{ light: string }>;
    expect(sunny.length).toBeGreaterThan(0);
    expect(sunny.every((item) => item.light === "Full sun")).toBe(true);
    await expect(page).toHaveURL(/light=Full\+sun|light=Full%20sun/);
  });

  test("13. customers can go to pages 2, 3 and 4", async ({ page }) => {
    let answer = listAnswer(page);
    await page.goto("/shop");
    await answer;
    const seen = new Set<string>();
    seen.add((await cardNames(page)).join("|"));
    for (const target of [2, 3, 4]) {
      answer = listAnswer(page);
      await page.getByTestId("pagination").getByRole("button", { name: String(target), exact: true }).click();
      const body = await (await answer).json();
      expect(body.page).toBe(target);
      await expect(page).toHaveURL(new RegExp(`page=${target}`));
      await expect(page.getByTestId("pagination").getByRole("button", { name: String(target), exact: true })).toHaveAttribute("aria-current", "page");
      await expect.poll(async () => (await cardNames(page))[0]).toBe(body.items[0].name);
      seen.add((await cardNames(page)).join("|"));
    }
    expect(seen.size).toBe(4);
  });

  test("14. pagination keeps the filter", async ({ page }) => {
    let answer = listAnswer(page);
    await page.goto("/shop?category=Indoor%20Plants");
    const first = await (await answer).json();
    expect(first.totalPages).toBeGreaterThan(1);
    answer = listAnswer(page);
    await page.getByTestId("next-page").click();
    const second = await (await answer).json();
    expect(second.page).toBe(2);
    expect(second.items.every((item: { category: string }) => item.category === "Indoor Plants")).toBe(true);
    await expect(page).toHaveURL(/category=Indoor(\+|%20)Plants.*page=2|page=2.*category=Indoor(\+|%20)Plants/);
  });

  test("15. Arabic pages have no overlaps, clipping or sideways scrolling", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("qleaves-language", "ar"));
    for (const path of ["/shop?category=Outdoor%20Plants", "/plants/e2e-outdoor-palm", "/plants/e2e-care-fern", "/about"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.waitForTimeout(1500);
      expect(await audit(page), path).toEqual({ overlaps: [], overflow: 0 });
    }
  });
});

test.describe("checkout", () => {
  test("16 and 17. a dropped answer: the order is recovered after a refresh, once", async ({ page, request }) => {
    const phone = uniquePhone();
    await readyCheckout(page, request, phone);
    let calls = 0;
    await page.route("**/api/v1/orders", async (route) => {
      calls += 1;
      if (calls === 1) { await route.fetch(); await route.abort("connectionreset"); return; } // saved on the server, answer lost
      await route.continue();
    });
    await page.click("button[type=submit]");
    await page.waitForSelector("[data-testid=order-submission]", { timeout: 10_000 });
    await page.reload();
    await page.waitForURL(/\/order\//, { timeout: 30_000 });
    const orders = await ordersFor(request, phone);
    expect(orders).toHaveLength(1);
    expect(page.url()).toContain(orders[0].orderNumber);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("18. a slow email does not hold up checkout", async ({ page, request }) => {
    const phone = uniquePhone();
    await readyCheckout(page, request, phone);
    const started = Date.now();
    await page.click("button[type=submit]");
    await page.waitForURL(/\/order\//, { timeout: 10_000 });
    expect(Date.now() - started).toBeLessThan(4_000); // the email provider hangs for the server's full 5 s timeout
    await expect.poll(async () => (await ordersFor(request, phone))[0]?.notifications?.some((n) => n.lastErrorCode === "TIMEOUT"), { timeout: 20_000 }).toBe(true);
  });

  test("19. a public invoice opens only with its signed link", async ({ page, request }) => {
    const admin = await adminRequest(request);
    const order = (await (await admin.get("/api/v1/admin/orders?page=1&tab=PENDING")).json()).items[0] as { orderNumber: string; invoiceToken: string; customerName: string };
    await page.goto(`/invoice/${order.orderNumber}?token=${order.invoiceToken}`);
    await expect(page.locator("body")).toContainText(order.customerName);
    await page.goto(`/invoice/${order.orderNumber}?token=not-the-token`);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(order.customerName);
    await page.goto(`/invoice/${order.orderNumber}`);
    await expect(page.locator("body")).not.toContainText(order.customerName);
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ page }) => { await adminRequest(page.request); });

  test("20. editing a product and replacing its photo reach the shop", async ({ page, request }) => {
    await page.goto("/admin/products");
    await page.locator("#admin-products-search-input").fill("E2E Care Fern");
    const card = page.locator(".admin-product-card").filter({ hasText: "E2E Care Fern" });
    await expect(card).toHaveCount(1);
    await card.getByRole("spinbutton", { name: /price/i }).fill("90");
    await card.getByRole("spinbutton", { name: /stock/i }).fill("7");
    await card.getByRole("spinbutton", { name: /stock/i }).blur();
    await expect(card.locator(".admin-product-save-status")).toContainText(/Saved/i, { timeout: 10_000 });

    const photo = join(__dirname, "../public/media/plants/agave-640.webp");
    await card.locator('input[type=file][aria-label$=": Replace"]').setInputFiles(photo);
    await expect(card.locator(".admin-photos__status")).toHaveCount(0, { timeout: 30_000 });
    expect(await card.locator(".admin-photos__error").allTextContents()).toEqual([]);

    const live = await (await request.get("/api/v1/products/e2e-care-fern")).json();
    expect(live.priceQar).toBe(90);
    expect(live.stock).toBe(7);
    expect(live.media.every((media: { url: string }) => media.url.includes("/storage/v1/object/public/"))).toBe(true);
    await page.goto("/plants/e2e-care-fern");
    await expect(page.locator(".product-detail__media img").first()).toHaveAttribute("src", /\/storage\/v1\/object\/public\//);
  });

  test("21. admin products and orders come in pages", async ({ page }) => {
    await page.goto("/admin/products");
    const pager = page.locator(".admin-pager");
    await expect(pager.locator(".admin-pager__count")).toHaveText(/^1–25 of \d+$/);
    const firstPage = await page.locator(".admin-product-card__name").allTextContents();
    await pager.getByRole("button", { name: "Page 2" }).click();
    await expect(pager.locator(".admin-pager__count")).toHaveText(/^26–50 of \d+$/);
    await expect.poll(async () => (await page.locator(".admin-product-card__name").allTextContents())[0]).not.toBe(firstPage[0]);

    await page.goto("/admin/orders");
    await expect(page.locator(".admin-pager__count")).toHaveText(/^1–25 of (2[6-9]|[3-9]\d)$/);
    await page.locator(".admin-pager").getByRole("button", { name: "Next" }).click();
    await expect(page.locator(".admin-pager__count")).toHaveText(/^26–\d+ of \d+$/);
  });

  test.skip("22. invoice print layout matches the owner's reference", () => {
    // Waits for the invoice reference the owner will supply (stage 8). Nothing to compare against yet.
  });
});
