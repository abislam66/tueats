import Link from "next/link";

import { AnalyticsBeacon } from "@/components/analytics/analytics-beacon";
import { SiteHeader } from "@/components/layout/site-header";
import {
  VenueReviews,
  type OwnRating,
  type PublicReview,
} from "@/components/reviews/venue-reviews";
import { AddVenuePhotoForm } from "@/components/venues/add-venue-photo-form";
import { ReportProblemForm } from "@/components/venues/report-problem-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { HalalTag, PaymentTag } from "@/components/venues/venue-bits";
import { VenuePhotoGallery } from "@/components/venues/venue-photo-gallery";
import { AnalyticsEvent } from "@/lib/analytics";
import {
  campusWeekday,
  formatClockTime,
  getDetailStatus,
  WEEKDAY_KEYS,
  type VenueHours,
} from "@/lib/hours";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import { venuePlainLine } from "@/lib/venue-groups";
import { venueLocationText, type Venue } from "@/lib/venues";

const DAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
} as const;

/** "5:30 AM" / "10:00 PM" — always shows minutes, matches the weekly-schedule format. */
function displayTime(value: string): string {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function HoursTable({ hours }: { hours: VenueHours | null }) {
  if (!hours) return <p className="unknown-value">Hours unknown</p>;
  const today = campusWeekday();
  return (
    <dl className="hours-list">
      {WEEKDAY_KEYS.map((day) => {
        const ranges = hours[day] ?? [];
        const isToday = day === today;
        return (
          <div className={isToday ? "hours-today" : undefined} key={day}>
            <dt>
              {DAY_LABELS[day]}
              {isToday ? <span className="sr-only"> (today)</span> : null}
            </dt>
            <dd>
              {ranges.length
                ? ranges
                    .map(
                      (range) =>
                        `${displayTime(range.open)} – ${displayTime(range.close)}`,
                    )
                    .join(", ")
                : "Closed"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The one big answer: open until when, and how long is left. */
function StatusCard({ venue }: { venue: Venue }) {
  const status = getDetailStatus(venue.hours);
  return (
    <section aria-label="Open status" className="status-card">
      {status.kind === "open" ? (
        <>
          <p className="status-card-lead is-open">Open now, until</p>
          <p className="status-card-time">
            <time>{formatClockTime(status.closesAt)}</time>
          </p>
          <p
            className={
              status.closingSoon
                ? "status-card-left is-warning"
                : "status-card-left"
            }
          >
            {status.left}
          </p>
        </>
      ) : status.kind === "closed" ? (
        <>
          <p className="status-card-lead">
            {status.opensAt
              ? `Closed now, opens${status.when ? ` ${status.when}` : ""}`
              : "Closed now"}
          </p>
          {status.opensAt ? (
            <p className="status-card-time is-closed">
              <time>{formatClockTime(status.opensAt)}</time>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="status-card-lead">Hours unknown</p>
          <p className="status-card-left">
            Check with the place before you go.
          </p>
        </>
      )}
      <a
        className="button button-primary status-card-cta"
        href={googleMapsDirectionsUrl(venue)}
        rel="noreferrer"
        target="_blank"
      >
        Get directions
      </a>
      <p className="status-card-note">
        Hours are a guide. Schedules can change.
      </p>
    </section>
  );
}

function SignInPrompt({
  next,
  authError,
}: {
  next: string;
  authError: boolean;
}) {
  return (
    <div className="sign-in-prompt">
      <p>Sign in to rate this place or add a photo.</p>
      {authError ? (
        <p className="form-error">
          Sign-in didn&rsquo;t go through. Try again.
        </p>
      ) : null}
      <GoogleSignInButton next={next} />
    </div>
  );
}

export function VenueDetail({
  venue,
  backPath,
  reviews,
  ownRating,
  userId,
  isAdmin,
  authError = false,
}: {
  venue: Venue;
  backPath: string;
  reviews: PublicReview[];
  ownRating: OwnRating | null;
  userId: string | null;
  isAdmin: boolean;
  authError?: boolean;
}) {
  const verified = venue.lastVerifiedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${venue.lastVerifiedAt}T12:00:00Z`))
    : null;
  const line = venuePlainLine(venue) || venueLocationText(venue).text;
  const canWrite = venue.status !== "retired";
  const retired = venue.status === "retired";

  return (
    <div className="public-page">
      <AnalyticsBeacon
        event={AnalyticsEvent.VenueDetailViewed}
        properties={{ venue_id: venue.id, venue_type: venue.type }}
      />
      <SiteHeader />
      <main className="detail-page">
        <Link
          aria-label="Back to the map"
          className="back-link place-back-link"
          href={backPath}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 18 18"
            width="18"
          >
            <path d="M11.5 3.5 6 9l5.5 5.5" />
          </svg>
          Back to the map
        </Link>

        {retired ? (
          <div className="retired-banner">
            <strong>This place has closed.</strong>
            <span>
              We keep this page available so old links still make sense.
            </span>
          </div>
        ) : null}

        <header className="detail-hero">
          <h1>{venue.name}</h1>
          <p className="detail-line">{line}</p>
          {venue.acceptsCard === false || venue.isHalal ? (
            <div className="detail-tags">
              <PaymentTag card={venue.acceptsCard} />
              <HalalTag isHalal={venue.isHalal} />
            </div>
          ) : null}
        </header>

        {retired ? null : <StatusCard venue={venue} />}

        <section className="detail-section">
          <h2>Usual hours</h2>
          <HoursTable hours={venue.hours} />
        </section>

        <VenuePhotoGallery slug={venue.slug} venueName={venue.name} />

        {canWrite && userId ? (
          <div className="add-photo-slot">
            <AddVenuePhotoForm venueId={venue.id} />
          </div>
        ) : null}

        <VenueReviews
          canWrite={canWrite}
          isAdmin={isAdmin}
          ownRating={ownRating}
          reviews={reviews}
          signIn={
            <SignInPrompt authError={authError} next={`/eat/${venue.slug}`} />
          }
          summary={venue.studentRating}
          userId={userId}
          venueId={venue.id}
        />

        {venue.description ? (
          <section className="detail-section">
            <h2>Good to know</h2>
            <p>{venue.description}</p>
          </section>
        ) : null}

        <section className="verification-block">
          <p className="verification-date">
            Last verified <strong>{verified ?? "not yet"}</strong>
          </p>
          {retired ? null : (
            <ReportProblemForm venueId={venue.id} venueName={venue.name} />
          )}
        </section>
      </main>
    </div>
  );
}
