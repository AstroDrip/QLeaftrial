// Product search shared by the API and the storefront's saved-catalogue view, so both rank results the same way.
// Pure TypeScript with no imports: the web app imports this file directly (apps/web/src/features/catalog/search.ts).
//
// What it does:
//  - English: case- and accent-insensitive.
//  - Arabic: hamza/alef forms, alef maqsura, taa marbuta, diacritics, tatweel, Arabic/Persian digits and
//    punctuation are normalised; the definite article "ال" is ignored.
//  - Mixed Arabic + English queries, several words, prefixes (as you type), substrings and small typos.
//  - Results are ranked: a match in the name beats one in an alias, scientific name, category or description.

export type SearchableProduct = {
  id: string;
  name: string;
  nameAr?: string | null;
  scientificName?: string | null;
  searchAliases?: string | null;
  category?: string | null;
  categoryAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  slug?: string | null;
};

export type SearchHit = { id: string; score: number };

// How much a match in each field counts.
const FIELD_WEIGHTS = {
  name: 10,
  nameAr: 10,
  searchAliases: 8,
  scientificName: 7,
  slug: 4,
  category: 3,
  categoryAr: 3,
  description: 1,
  descriptionAr: 1,
} as const;
type Field = keyof typeof FIELD_WEIGHTS;
const FIELDS = Object.keys(FIELD_WEIGHTS) as Field[];
const NAME_FIELDS: Field[] = ["name", "nameAr", "searchAliases", "scientificName"];

const ARABIC_LETTER = /[ء-يٮ-ۓۺ-ۿ]/;

/** Lower-cases and strips everything that should not change what a word means. */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return "";
  let text = value.normalize("NFKD").toLowerCase();
  text = text
    // Combining marks: Latin accents and Arabic harakat, shadda, sukun, hamza above/below, maddah, dagger alef.
    // (NFKD has already split أ إ آ ؤ ئ into their base letter plus one of these marks.)
    .replace(/[̀-ًͯ-ٰٟۖ-ۭ]/g, "")
    .replace(/ـ/g, "") // tatweel
    .replace(/[ٱٲٳٵ]/g, "ا") // alef wasla and other alef forms -> ا
    .replace(/ى/g, "ي") // alef maqsura -> ي
    .replace(/[یے]/g, "ي") // Persian/Urdu yeh -> ي
    .replace(/ة/g, "ه") // taa marbuta -> ه
    .replace(/ک/g, "ك") // Persian kaf -> ك
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/ß/g, "ss");
  // Anything that is not a letter or digit separates words; so does a switch between Arabic and Latin script.
  text = text.replace(/[^\p{L}\p{N}]+/gu, " ");
  text = text.replace(/([؀-ۿ])(?=[a-z0-9])|([a-z0-9])(?=[؀-ۿ])/g, "$1$2 ");
  return text.replace(/\s+/g, " ").trim();
}

function stripArticle(token: string): string {
  // "ال" (and "وال", "بال", "فال", "كال", "لل") at the start of a word of four letters or more.
  if (!ARABIC_LETTER.test(token)) return token;
  const match = /^(?:[وفبك]?ال|لل)(.{2,})$/.exec(token);
  return match ? match[1] : token;
}

export function tokenizeSearchText(value: string | null | undefined): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

/** A word and, for Arabic words with the article, the word without it ("النخيل" also as "نخيل"). */
function wordForms(token: string): string[] {
  const bare = stripArticle(token);
  return bare === token ? [token] : [token, bare];
}

// Optimal string alignment distance (Levenshtein plus swapped neighbours), stopping early past `max`.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous2: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, previous2[j - 2] + 1);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous2 = previous;
    previous = current;
  }
  return previous[b.length];
}

function allowedTypos(length: number): number {
  return length >= 8 ? 2 : length >= 4 ? 1 : 0;
}

/** How well one typed word matches one word of a product (0 = not at all, 1 = exactly). */
export function tokenMatchScore(query: string, word: string): number {
  if (query === word) return 1;
  if (word.startsWith(query)) return query.length >= 2 ? 0.85 : 0.5;
  if (query.length >= 3 && word.includes(query)) return 0.6;
  const typos = allowedTypos(query.length);
  if (typos === 0) return 0;
  if (editDistance(query, word, typos) <= typos) return 0.55;
  // A misspelt word still being typed: compare with the start of the product's word.
  if (word.length > query.length && editDistance(query, word.slice(0, query.length), typos) <= typos) return 0.45;
  return 0;
}

type Posting = { doc: number; weight: number };
type IndexedProduct = { id: string; name: string; names: string[] };

export type ProductSearchIndex = {
  products: IndexedProduct[];
  vocabulary: Map<string, Posting[]>;
};

/** Builds the word index once; searching it is then fast enough for every keystroke on a large catalogue. */
export function buildProductSearchIndex(products: SearchableProduct[]): ProductSearchIndex {
  const vocabulary = new Map<string, Posting[]>();
  const indexed: IndexedProduct[] = [];
  products.forEach((product, doc) => {
    const best = new Map<string, number>();
    for (const field of FIELDS) {
      for (const token of tokenizeSearchText(product[field]).flatMap(wordForms)) {
        const weight = FIELD_WEIGHTS[field];
        if ((best.get(token) ?? 0) < weight) best.set(token, weight);
      }
    }
    for (const [token, weight] of best) {
      const postings = vocabulary.get(token);
      if (postings) postings.push({ doc, weight });
      else vocabulary.set(token, [{ doc, weight }]);
    }
    indexed.push({
      id: product.id,
      name: product.name,
      names: NAME_FIELDS.map((field) => tokenizeSearchText(product[field]).join(" ")).filter(Boolean),
    });
  });
  return { products: indexed, vocabulary };
}

/**
 * Products matching the query, best first. Every word of the query must match; if no product has them all,
 * products matching at least half the words are returned instead (so one stray word does not empty the page).
 */
export function searchProductIndex(index: ProductSearchIndex, query: string): SearchHit[] {
  const tokens = [...new Set(tokenizeSearchText(query))];
  if (tokens.length === 0) return [];

  // Best score per product for each query word.
  const perToken = tokens.map((token) => {
    const forms = wordForms(token);
    const scores = new Map<number, number>();
    for (const [word, postings] of index.vocabulary) {
      const match = forms.reduce((best, form) => Math.max(best, tokenMatchScore(form, word)), 0);
      if (match === 0) continue;
      for (const { doc, weight } of postings) {
        const score = weight * match;
        if ((scores.get(doc) ?? 0) < score) scores.set(doc, score);
      }
    }
    return scores;
  });

  const totals = new Map<number, { score: number; matched: number }>();
  perToken.forEach((scores) => {
    for (const [doc, score] of scores) {
      const total = totals.get(doc) ?? { score: 0, matched: 0 };
      total.score += score;
      total.matched += 1;
      totals.set(doc, total);
    }
  });

  const needAll = [...totals.values()].some((total) => total.matched === tokens.length);
  const minimum = needAll ? tokens.length : Math.ceil(tokens.length / 2);
  const phrase = tokens.join(" ");

  const hits: Array<SearchHit & { name: string }> = [];
  for (const [doc, total] of totals) {
    if (total.matched < minimum) continue;
    const product = index.products[doc];
    let score = total.score * (total.matched / tokens.length);
    // The whole query as typed, inside a name: a strong signal, strongest when the name starts with it.
    for (const name of product.names) {
      if (name === phrase) { score += 12; break; }
      if (name.startsWith(phrase)) { score += 8; break; }
      if (tokens.length > 1 && name.includes(phrase)) { score += 5; break; }
    }
    hits.push({ id: product.id, score: Math.round(score * 1000) / 1000, name: product.name });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map(({ id, score }) => ({ id, score }));
}

export function searchProducts(products: SearchableProduct[], query: string): SearchHit[] {
  return searchProductIndex(buildProductSearchIndex(products), query);
}
