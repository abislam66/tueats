"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { usePostHog } from "posthog-js/react";

import { deleteRating, submitRating } from "@/actions/ratings";
import { hideRating } from "@/actions/admin";
import { StarRating } from "@/components/reviews/star-rating";
import { Button } from "@/components/ui/primitives";
import { MAX_REVIEW_TEXT_LENGTH } from "@/config/site";
import { AnalyticsEvent } from "@/lib/analytics";
import { formatStudentRating, type StudentRatingSummary } from "@/lib/ratings";
import { formatRelativeDate } from "@/lib/relative-time";

export type PublicReview = {
  id: string;
  userId: string;
  stars: number;
  reviewText: string | null;
  status: "active" | "removed";
  removedReason: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnRating = {
  stars: number;
  reviewText: string | null;
  status: "active" | "removed";
  removedReason: string | null;
};

export function VenueReviews({
  venueId,
  summary,
  reviews,
  ownRating,
  userId,
  isAdmin,
  canWrite,
  signIn,
}: {
  venueId: string;
  summary: StudentRatingSummary | null;
  reviews: PublicReview[];
  ownRating: OwnRating | null;
  /** null when signed out — reviews stay readable, writing needs sign-in. */
  userId: string | null;
  isAdmin: boolean;
  canWrite: boolean;
  /** Shown instead of the composer when signed out. */
  signIn?: ReactNode;
}) {
  const visible = reviews.filter(
    (review) => review.status === "active" || review.userId === userId,
  );

  return (
    <section className="detail-section reviews-section">
      <h2>What students think</h2>
      {summary ? (
        <p className="student-rating-aggregate">
          {formatStudentRating(summary)}
        </p>
      ) : (
        <p className="reviews-empty">No student ratings yet.</p>
      )}

      {canWrite && !userId ? signIn : null}

      {canWrite && userId ? (
        <ReviewComposer
          initial={ownRating?.status === "removed" ? null : ownRating}
          key={ownRating?.status === "active" ? "mine" : "new"}
          venueId={venueId}
        />
      ) : null}

      {ownRating?.status === "removed" ? (
        <p className="review-removed-note" role="status">
          Your review was removed
          {ownRating.removedReason ? ` (${ownRating.removedReason})` : ""}.
        </p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="review-list">
          {visible.map((review) => (
            <ReviewItem
              isAdmin={isAdmin}
              isOwn={review.userId === userId}
              key={review.id}
              review={review}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ReviewComposer({
  venueId,
  initial,
}: {
  venueId: string;
  initial: OwnRating | null;
}) {
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [text, setText] = useState(initial?.reviewText ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const posthog = usePostHog();

  async function save() {
    if (stars < 1) {
      setError("Pick a star rating first.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await submitRating({
      venueId,
      stars,
      reviewText: text,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    posthog.capture(AnalyticsEvent.RatingSubmitted, {
      venue_id: venueId,
      stars,
      has_review_text: text.trim().length > 0,
      is_update: Boolean(initial),
    });
    setNotice(initial ? "Updated." : "Saved.");
    router.refresh();
  }

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteRating({ venueId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    posthog.capture(AnalyticsEvent.RatingRemoved, { venue_id: venueId });
    setStars(0);
    setText("");
    setNotice("Removed.");
    router.refresh();
  }

  return (
    <form
      className="review-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="review-composer-label">
        {initial ? "Your rating" : "Rate this spot"}
      </p>
      <StarRating name="stars" onChange={setStars} value={stars} />
      <label>
        <span>
          Review <small>Optional</small>
        </span>
        <textarea
          maxLength={MAX_REVIEW_TEXT_LENGTH}
          onChange={(event) => setText(event.target.value)}
          placeholder="What should people order — or skip?"
          rows={4}
          value={text}
        />
      </label>
      <p className="review-policy">
        Keep it about the food. No insults, no spam. Reviews show your display
        name and are public.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      <div className="review-composer-actions">
        <Button disabled={pending} type="submit">
          {initial ? "Update" : "Post"}
        </Button>
        {initial ? (
          <Button
            disabled={pending}
            onClick={() => void remove()}
            variant="ghost"
          >
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ReviewItem({
  review,
  isOwn,
  isAdmin,
}: {
  review: PublicReview;
  isOwn: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = review.status === "removed";

  async function hide() {
    setPending(true);
    setError(null);
    const result = await hideRating({
      ratingId: review.id,
      reason: "Removed by a moderator",
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <li className={removed ? "review-item is-removed" : "review-item"}>
      <div className="review-item-head">
        <strong>{review.displayName}</strong>
        <StarRating readOnly value={review.stars} />
        <time dateTime={review.createdAt}>
          {formatRelativeDate(review.createdAt)}
        </time>
      </div>
      {review.reviewText ? <p>{review.reviewText}</p> : null}
      {removed && isOwn ? (
        <p className="review-removed-note">
          Removed{review.removedReason ? ` — ${review.removedReason}` : ""}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {isAdmin && !removed && !isOwn ? (
        <Button disabled={pending} onClick={() => void hide()} variant="ghost">
          Hide review
        </Button>
      ) : null}
    </li>
  );
}
