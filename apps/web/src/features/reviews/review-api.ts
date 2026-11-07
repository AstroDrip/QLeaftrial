import { errorFromResponse } from "../../lib/api-error";
import type { PublicReview } from "./review-types";

export const reviewApi = {
  list: async (): Promise<PublicReview[]> => {
    const response = await fetch("/api/v1/reviews");
    if (!response.ok) throw await errorFromResponse(response);
    return ((await response.json()) as { items: PublicReview[] }).items;
  },
};
