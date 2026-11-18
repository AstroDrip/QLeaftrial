import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Test plants and orders for the browser journeys (scripts/e2e-server.ts). Made-up names ("E2E ..."), made-up
// customers at example.test addresses; photos are the storefront's own plant photo files.
const mediaFolder = fileURLToPath(new URL("../../web/public/media/plants/", import.meta.url));
export const E2E_PHOTOS = readdirSync(mediaFolder).filter((name) => name.endsWith("-640.webp")).sort().map((name) => `/media/plants/${name}`);

const LIGHTS = [["Bright indirect", "إضاءة ساطعة غير مباشرة"], ["Medium indirect", "إضاءة متوسطة غير مباشرة"], ["Low to bright indirect", "إضاءة منخفضة إلى ساطعة غير مباشرة"], ["Full sun", "شمس كاملة"]] as const;
const CATEGORIES = [["Indoor Plants", "نباتات داخلية"], ["Indoor Plants", "نباتات داخلية"], ["Outdoor Plants", "نباتات خارجية"], ["Table Top Plants", "نباتات مكتبية"]] as const;

function photos(name: string, index: number, count: number) {
  return Array.from({ length: count }, (_, photo) => {
    const url = E2E_PHOTOS[(index * 3 + photo) % E2E_PHOTOS.length];
    const photoKey = `e2e-${index}-${photo}`;
    return [
      { url, altText: `${name} photo ${photo + 1}`, purpose: "catalog", sortOrder: photo * 2, photoKey, width: 640, height: 640 },
      { url, altText: `${name} photo ${photo + 1}`, purpose: "detail", sortOrder: photo * 2 + 1, photoKey, width: 640, height: 640 },
    ];
  }).flat();
}

export function e2eProducts() {
  const base = Date.UTC(2026, 9, 1);
  const plants = Array.from({ length: 96 }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const name = `E2E Plant ${number}`;
    const [category, categoryAr] = CATEGORIES[index % CATEGORIES.length];
    const [light, lightAr] = LIGHTS[index % LIGHTS.length];
    return {
      slug: `e2e-plant-${number}`, sku: `E2E-${number}`, name, nameAr: `نبتة اختبار ${number}`,
      description: `${name} is a made-up plant used by the browser tests.`, descriptionAr: `نبتة اختبار ${number} تُستخدم في اختبارات المتصفح.`,
      category, categoryAr, light, lightAr, priceQar: 40 + index, costPrice: 10, published: true,
      careLevel: ["easy", "moderate", "demanding"][index % 3], placement: category === "Outdoor Plants" ? "outdoor" : "indoor",
      heightCm: [25, 60, 130][index % 3], createdAt: new Date(base + index * 3_600_000),
      stock: 20, media: photos(name, index, (index % 3) + 1),
    };
  });
  const special = [
    {
      slug: "e2e-care-fern", sku: "E2E-CARE", name: "E2E Care Fern", nameAr: "سرخس العناية للاختبار",
      description: "A made-up fern with every care detail filled in.", descriptionAr: "سرخس للاختبار بكل تفاصيل العناية.",
      category: "Indoor Plants", categoryAr: "نباتات داخلية", light: "Medium indirect", lightAr: "إضاءة متوسطة غير مباشرة",
      watering: "Keep the soil lightly moist", wateringAr: "حافظ على رطوبة التربة قليلًا", humidity: "Likes humid air", humidityAr: "يحب الهواء الرطب",
      soil: "Peat-based mix", soilAr: "خلطة أساسها البيتموس", temperature: "18 to 28 °C", temperatureAr: "من 18 إلى 28 درجة مئوية",
      careLevel: "moderate", placement: "indoor", priceQar: 85, costPrice: 20, published: true, createdAt: new Date(Date.UTC(2026, 8, 1)),
      stock: 9, media: photos("E2E Care Fern", 200, 1),
    },
    {
      slug: "e2e-outdoor-palm", sku: "E2E-PALM", name: "E2E Outdoor Palm", nameAr: "نخلة خارجية للاختبار",
      description: "A made-up tall palm for the garden.", descriptionAr: "نخلة طويلة للحديقة للاختبار.",
      category: "Outdoor Plants", categoryAr: "نباتات خارجية", light: "Full sun", lightAr: "شمس كاملة",
      placement: "outdoor", heightCm: 150, potIncluded: false, sizeNote: "Tall palm, about shoulder height", sizeNoteAr: "نخلة طويلة بارتفاع الكتف تقريبًا",
      handlingNote: "Delivered upright by two people", handlingNoteAr: "تُوصَل واقفة بواسطة شخصين",
      priceQar: 450, costPrice: 200, published: true, createdAt: new Date(Date.UTC(2026, 8, 2)), stock: 3, media: photos("E2E Outdoor Palm", 201, 2),
    },
  ];
  return [...plants, ...special];
}

/** Thirty orders spread over every status, a few days apart, for the admin lists. */
export function e2eOrders(products: Array<{ id: string; name: string; sku: string; priceQar: number }>) {
  const statuses = ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const;
  return Array.from({ length: 30 }, (_, index) => {
    const product = products[index % products.length];
    const quantity = (index % 3) + 1;
    const status = index < 27 ? "PENDING" : statuses[index % statuses.length];
    return {
      orderNumber: `QL-E2E-${String(index + 1).padStart(3, "0")}`,
      customerName: `Test Customer ${String(index + 1).padStart(2, "0")}`, phone: `+974 5000 ${String(1000 + index)}`, email: `customer${index + 1}@example.test`,
      addressLine1: "Building 1, Street 1", area: "Doha", paymentMethod: "COD", status, paymentStatus: index % 2 ? "PAID" : "PENDING",
      subtotalQar: product.priceQar * quantity, deliveryFeeQar: 0, createdAt: new Date(Date.UTC(2026, 10, 1) + index * 4 * 3_600_000),
      items: { create: [{ productId: product.id, productName: product.name, sku: product.sku, unitPriceQar: product.priceQar, quantity }] },
    };
  });
}
