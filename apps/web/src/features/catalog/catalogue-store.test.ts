import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idbGet, idbSet, resetIdbForTests } from "../../lib/idb";
import {
  CATALOGUE_API_URL, CATALOGUE_DATABASE, CATALOGUE_STORAGE_KEY, STATIC_CATALOGUE_URL,
  catalogueFreshness, fetchCatalogue, isSnapshot, readCachedCatalogue, readStoredCatalogue, writeCachedCatalogue,
  type LoadedCatalogue,
} from "./catalogue-client";
import type { CatalogueProduct, CatalogueSnapshot } from "./catalogue-types";

// How the storefront gets its product list: saved copy first, then the static and live copies requested together,
// the freshest valid one winning, and the freshest kept in the browser for next time.
const product = (id: string, name = id.toUpperCase()): CatalogueProduct => ({
  id, slug: id, name, nameAr: null, description: "", descriptionAr: null, category: "Indoor Plants", categoryAr: null,
  light: null, lightAr: null, priceQar: 100, stock: 3, inStock: true, image: null, media: [],
});
const copy = (generatedAt: string, ids: string[]): CatalogueSnapshot => ({
  version: generatedAt, generatedAt, productCount: ids.length, products: ids.map((id) => product(id)),
});
const BUILD = copy("2026-11-16T08:00:00.000Z", ["a", "b"]);
const LIVE = copy("2026-11-17T09:00:00.000Z", ["a", "b", "c"]);
const OLD = copy("2026-11-01T00:00:00.000Z", ["a"]);

type Answer = { body?: unknown; status?: number; fail?: boolean } | (() => Promise<Response>);
function serve(answers: Record<string, Answer>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const answer = answers[url];
    if (typeof answer === "function") return answer();
    if (!answer || answer.fail) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ ok: (answer.status ?? 200) < 400, status: answer.status ?? 200, json: async () => answer.body } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };
const storedInIdb = () => idbGet<{ snapshot: CatalogueSnapshot }>(CATALOGUE_DATABASE, "snapshots", "current");

describe("catalogue loading and the browser's saved copy", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    resetIdbForTests();
    localStorage.clear();
  });
  afterEach(() => {
    resetIdbForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("requests the static and live copies together and shows the static one without waiting for the API", async () => {
    let answerLive: (value: Response) => void = () => undefined;
    const fetchMock = serve({
      [CATALOGUE_API_URL]: () => new Promise<Response>((resolve) => { answerLive = resolve; }),
      [STATIC_CATALOGUE_URL]: { body: BUILD },
    });
    const shown: LoadedCatalogue[] = [];
    const loading = fetchCatalogue(undefined, (catalogue) => shown.push(catalogue));
    await settle();
    // Both requests went out at once, and the static copy is already on screen while the API is still thinking.
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([CATALOGUE_API_URL, STATIC_CATALOGUE_URL].sort());
    expect(shown.map((catalogue) => catalogue.generatedAt)).toEqual([BUILD.generatedAt]);

    answerLive({ ok: true, status: 200, json: async () => LIVE } as Response);
    const final = await loading;
    expect(final).toMatchObject({ source: "live", generatedAt: LIVE.generatedAt, productCount: 3 });
    expect(shown.map((catalogue) => catalogue.source)).toEqual(["snapshot", "live"]);
  });

  it("gives up on an API that never answers after a few seconds and keeps the static copy", async () => {
    // The API request only ends when the loader's own timer aborts it, as a real hung request would.
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => url === CATALOGUE_API_URL
      ? new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))
      : Promise.resolve({ ok: true, status: 200, json: async () => BUILD } as Response)));
    const started = Date.now();
    await expect(fetchCatalogue()).resolves.toMatchObject({ source: "snapshot", generatedAt: BUILD.generatedAt });
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(3_900);
    expect(waited).toBeLessThan(6_000);
  });

  it("never replaces a fresher saved copy with an older static or live copy", async () => {
    writeCachedCatalogue(LIVE);
    await vi.waitFor(async () => expect((await storedInIdb())?.snapshot.generatedAt).toBe(LIVE.generatedAt));
    // The CDN can serve a day-old live copy; the build copy can be older than what this browser already has.
    serve({ [CATALOGUE_API_URL]: { body: OLD }, [STATIC_CATALOGUE_URL]: { body: BUILD } });
    const shown: string[] = [];
    const final = await fetchCatalogue(undefined, (catalogue) => shown.push(catalogue.generatedAt));
    expect(final.generatedAt).toBe(LIVE.generatedAt);
    expect(shown).toEqual([LIVE.generatedAt]);
    expect((await storedInIdb())?.snapshot.generatedAt).toBe(LIVE.generatedAt);
  });

  it("prefers the live copy when it is exactly as fresh as the one already shown", async () => {
    serve({ [CATALOGUE_API_URL]: { body: BUILD }, [STATIC_CATALOGUE_URL]: { body: BUILD } });
    expect((await fetchCatalogue()).source).toBe("live");
  });

  it("rejects copies that are damaged, cut short or not a catalogue, and uses the good one", async () => {
    const truncated = { ...LIVE, productCount: 300 };
    expect(isSnapshot(truncated)).toBe(false);
    expect(isSnapshot({ ...LIVE, products: [{ ...product("x"), priceQar: Number.NaN }] })).toBe(false);
    expect(isSnapshot({ ...LIVE, version: "" })).toBe(false);
    expect(isSnapshot("<!doctype html>")).toBe(false);
    serve({ [CATALOGUE_API_URL]: { body: truncated }, [STATIC_CATALOGUE_URL]: { body: BUILD } });
    expect(await fetchCatalogue()).toMatchObject({ source: "snapshot", generatedAt: BUILD.generatedAt });
    serve({
      [CATALOGUE_API_URL]: () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } } as unknown as Response),
      [STATIC_CATALOGUE_URL]: { body: BUILD },
    });
    expect((await fetchCatalogue()).generatedAt).toBe(BUILD.generatedAt);
  });

  it("keeps the last good copy through a full outage, and only fails when there is nothing at all", async () => {
    serve({ [CATALOGUE_API_URL]: { status: 503, body: {} }, [STATIC_CATALOGUE_URL]: { fail: true } });
    await expect(fetchCatalogue()).rejects.toThrow(/could not be loaded/);
    writeCachedCatalogue(BUILD);
    await vi.waitFor(async () => expect(await storedInIdb()).toBeTruthy());
    expect(await fetchCatalogue()).toMatchObject({ source: "snapshot", generatedAt: BUILD.generatedAt });
  });

  it("keeps a catalogue too large for quick page-load reading in IndexedDB only", async () => {
    const big = copy("2026-11-17T10:00:00.000Z", Array.from({ length: 1_200 }, (_, index) => `plant-${index}`));
    for (const item of big.products) item.description = "A care note that makes each product a little longer. ".repeat(30);
    expect(JSON.stringify(big).length).toBeGreaterThan(1_500_000);
    writeCachedCatalogue(big);
    await vi.waitFor(async () => expect((await storedInIdb())?.snapshot.productCount).toBe(1_200));
    expect(localStorage.getItem(CATALOGUE_STORAGE_KEY)).toBeNull();
    expect(readCachedCatalogue()).toBeNull();
    expect((await readStoredCatalogue())?.snapshot.productCount).toBe(1_200);
  });

  it("still works with localStorage alone when IndexedDB is missing or blocked", async () => {
    vi.stubGlobal("indexedDB", undefined);
    resetIdbForTests();
    serve({ [CATALOGUE_API_URL]: { body: LIVE }, [STATIC_CATALOGUE_URL]: { body: BUILD } });
    expect((await fetchCatalogue()).generatedAt).toBe(LIVE.generatedAt);
    expect(readCachedCatalogue()?.snapshot.generatedAt).toBe(LIVE.generatedAt);
    expect((await readStoredCatalogue())?.snapshot.generatedAt).toBe(LIVE.generatedAt);
    await expect(idbSet(CATALOGUE_DATABASE, "snapshots", "x", 1)).rejects.toThrow();
  });

  it("orders copies by when they were generated, not by their newest product change", () => {
    // Unpublishing a product makes the newest-change version go backwards; the generation time does not.
    const afterUnpublish = { ...LIVE, version: "2026-11-10T00:00:00.000Z", generatedAt: "2026-11-17T12:00:00.000Z" };
    expect(catalogueFreshness(afterUnpublish)).toBeGreaterThan(catalogueFreshness(LIVE));
    expect(catalogueFreshness({ version: "2026-11-02T00:00:00.000Z" })).toBe(Date.parse("2026-11-02T00:00:00.000Z"));
    expect(catalogueFreshness(null)).toBe(0);
  });
});
