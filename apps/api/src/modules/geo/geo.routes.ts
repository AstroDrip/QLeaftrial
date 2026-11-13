import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/error-handler.js";
import { isInQatar, reverseGeocode, searchPlaces } from "../../lib/geo/qatar.js";

// Address search and "nearest address" for the checkout map. Both are POST so a typed address or a customer's
// coordinates never appear in a URL (and so never in access logs or caches). Results come from the Qatar place
// index inside this API; nothing is sent to a third party.
export const geoRouter = Router();

// Search-as-you-type is frequent, so a light per-instance limit is used rather than the database-backed one.
const WINDOW_MS = 60_000;
const LIMIT = 120;
const hits = new Map<string, { count: number; resetAt: number }>();
const geoRateLimit: RequestHandler = (request, response, next) => {
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = hits.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > LIMIT) {
    response.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return next(new ApiError(429, "TOO_MANY_SEARCHES", "Too many searches. Please wait a moment."));
  }
  next();
};

const language = z.enum(["en", "ar"]).default("en");
const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);

const searchSchema = z.object({
  q: z.string().trim().min(2).max(100),
  lang: language,
  near: z.object({ latitude, longitude }).optional(),
}).strict();

const reverseSchema = z.object({ latitude, longitude, lang: language }).strict();

geoRouter.post("/geo/search", geoRateLimit, (request, response) => {
  const parsed = searchSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Type at least two characters to search");
  const near = parsed.data.near && isInQatar(parsed.data.near.latitude, parsed.data.near.longitude) ? parsed.data.near : undefined;
  const results = searchPlaces(parsed.data.q, parsed.data.lang, { near, limit: 6 })
    .filter((place) => isInQatar(place.latitude, place.longitude))
    .map(({ id, kind, label, context, latitude: lat, longitude: lon, precision }) => ({ id, kind, label, context, latitude: lat, longitude: lon, precision }));
  response.setHeader("Cache-Control", "no-store");
  response.json({ results });
});

geoRouter.post("/geo/reverse", geoRateLimit, (request, response) => {
  const parsed = reverseSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid coordinates");
  const { latitude: lat, longitude: lon, lang } = parsed.data;
  response.setHeader("Cache-Control", "no-store");
  if (!isInQatar(lat, lon)) {
    response.json({ inQatar: false });
    return;
  }
  response.json({ inQatar: true, ...reverseGeocode(lat, lon, lang) });
});
