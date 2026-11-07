import { useState } from "react";
import { Link } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { LeafIcon } from "../../components/icons";
import { LeafLines } from "./LeafLines";
import type { StoryReview } from "./review-types";

const ARABIC_LETTERS = /[\u0600-\u06FF]/;

function Rating({ value, label }: { value: number; label: string }) {
  return (
    <span className="story-rating" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((step) => <LeafIcon key={step} className={step <= value ? "is-on" : undefined} />)}
    </span>
  );
}

// One customer story laid out like a field note: a photo (or a line drawing when there is none), a small
// tag, the words themselves, and who said them. The same sheet is used on the homepage and in the admin preview.
export function ReviewSheet({ review }: { review: StoryReview }) {
  const { content, isArabic } = useSiteLanguage();
  const t = content.home.stories;
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = review.imageUrl && !photoFailed ? review.imageUrl : null;
  const productName = review.product ? (isArabic && review.product.nameAr?.trim() ? review.product.nameAr : review.product.name) : null;
  const date = review.reviewedAt
    ? new Date(`${review.reviewedAt}T00:00:00Z`).toLocaleDateString(isArabic ? "ar-QA" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <article className="story-sheet">
      <figure className="story-sheet__photo">
        {photo ? (
          <img src={photo} alt={t.photoOf(review.customerName)} loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} />
        ) : (
          <LeafLines className="story-sheet__drawing" />
        )}
      </figure>
      <p className="story-sheet__tag">
        <span>{review.label || t.note}</span>
        {review.location ? <span>{review.location}</span> : null}
      </p>
      <blockquote className="story-sheet__quote"><p dir="auto" lang={ARABIC_LETTERS.test(review.body) ? "ar" : "en"}>{review.body}</p></blockquote>
      <footer className="story-sheet__by">
        <Rating value={review.rating} label={t.rating(review.rating)} />
        <cite className="story-sheet__name" dir="auto">{review.customerName}</cite>
        {review.product && productName ? (
          <Link className="story-sheet__product" to={`/plants/${review.product.slug}`}>{t.about} {productName}</Link>
        ) : null}
        {date ? <time className="story-sheet__date" dateTime={review.reviewedAt ?? undefined}>{date}</time> : null}
      </footer>
    </article>
  );
}
