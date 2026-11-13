import type { LatLon } from "./QatarMap";

// Address search and "nearest address" for the delivery map, answered by the QLeaves API from its Qatar place
// index. POST keeps typed addresses and coordinates out of URLs. Recent answers are cached in memory only.
export type Precision = "gps" | "landmark" | "street" | "area" | "pin";
export type PlaceSuggestion = { id: string; kind: "area" | "landmark" | "street"; label: string; context: string; latitude: number; longitude: number; precision: "area" | "landmark" | "street" };
export type ReverseAnswer = { inQatar: false } | { inQatar: true; formattedAddress: string; area: string | null; street: string | null; landmark: string | null; precision: "landmark" | "street" | "area" | "none" };

export class GeoServiceError extends Error {
  constructor(public readonly status: number) {
    super(`geo service ${status}`);
    this.name = "GeoServiceError";
  }
}

const CACHE_LIMIT = 60;
const searches = new Map<string, PlaceSuggestion[]>();
const reverses = new Map<string, ReverseAnswer>();
function remember<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/geo/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new GeoServiceError(response.status);
  return response.json() as Promise<T>;
}

export async function searchQatarPlaces(query: string, language: "en" | "ar", near: LatLon | null, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim().replace(/\s+/g, " ");
  const key = `${language}|${q.toLowerCase()}`;
  const cached = searches.get(key);
  if (cached) return cached;
  const { results } = await post<{ results: PlaceSuggestion[] }>("search", { q, lang: language, ...(near ? { near } : {}) }, signal);
  remember(searches, key, results);
  return results;
}

export async function reverseQatarPlace(point: LatLon, language: "en" | "ar", signal?: AbortSignal): Promise<ReverseAnswer> {
  // About 1 m: points this close share an answer.
  const key = `${language}|${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
  const cached = reverses.get(key);
  if (cached) return cached;
  const answer = await post<ReverseAnswer>("reverse", { latitude: point.latitude, longitude: point.longitude, lang: language }, signal);
  remember(reverses, key, answer);
  return answer;
}
