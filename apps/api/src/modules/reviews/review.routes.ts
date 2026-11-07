import { Router } from "express";
import { applyEdgeOnlyCacheHeaders } from "../../middleware/cache-headers.js";
import { ApiError } from "../../middleware/error-handler.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { createReviewSchema, moveReviewSchema, updateReviewSchema } from "./review.schemas.js";
import {
  createReview,
  deleteReview,
  listAdminReviews,
  listPublishedReviews,
  moveReview,
  updateReview,
} from "./review.service.js";

export const reviewRouter = Router();

reviewRouter.get("/reviews", async (_request, response) => {
  applyEdgeOnlyCacheHeaders(response);
  response.json({ items: await listPublishedReviews() });
});

reviewRouter.use("/admin/reviews", requireAdmin);

function invalid(message: string | undefined, fallback: string): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message ?? fallback);
}

reviewRouter.get("/admin/reviews", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ items: await listAdminReviews() });
});

reviewRouter.post("/admin/reviews", async (request, response) => {
  const parsed = createReviewSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message, "Invalid review");
  response.status(201).json(await createReview(parsed.data));
});

reviewRouter.patch("/admin/reviews/:id", async (request, response) => {
  const parsed = updateReviewSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message, "Invalid review changes");
  response.setHeader("Cache-Control", "no-store");
  response.json(await updateReview(request.params.id, parsed.data));
});

reviewRouter.post("/admin/reviews/:id/move", async (request, response) => {
  const parsed = moveReviewSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message, "Invalid move");
  response.setHeader("Cache-Control", "no-store");
  response.json({ items: await moveReview(request.params.id, parsed.data) });
});

reviewRouter.delete("/admin/reviews/:id", async (request, response) => {
  await deleteReview(request.params.id);
  response.status(204).end();
});
