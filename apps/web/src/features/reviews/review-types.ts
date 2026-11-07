// What the storefront needs to draw one customer story. The admin preview builds the same shape from its form.
export type StoryReview = {
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
  product: { slug: string; name: string; nameAr?: string | null } | null;
  reviewedAt: string | null;
  location: string | null;
  label: string | null;
};

export type PublicReview = StoryReview & { id: string };
