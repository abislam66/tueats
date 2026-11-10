import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { VenueDetail } from "@/components/venues/venue-detail";
import { getUser } from "@/lib/auth";
import {
  getUserRatingForVenue,
  getVenueBySlug,
  listVenueReviews,
  toVenue,
} from "@/lib/db/queries";
import { safeInternalPath } from "@/lib/safe-path";
import type { Venue } from "@/lib/venues";

export const dynamic = "force-dynamic";

// React's cache() dedupes this by argument within a single request, so
// generateMetadata and the page component below share one DB call
// instead of two — same pattern Next's own docs recommend for this exact
// "metadata needs the same data as the page" case.
const loadVenue = cache(getVenueBySlug);

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ auth_error?: string; from?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const row = await loadVenue(slug);
  if (!row) return {};

  // The page is public now, so the admin-written description can lead;
  // fall back to a plain summary when there isn't one.
  const blurb = row.description?.trim();
  const description = blurb
    ? blurb.length > 160
      ? `${blurb.slice(0, 157).trimEnd()}…`
      : blurb
    : `Hours, location, and student ratings for ${row.name}, near Temple University.`;
  return {
    title: row.name,
    description,
    alternates: { canonical: `/eat/${slug}` },
    openGraph: { title: row.name, description, url: `/eat/${slug}` },
    twitter: { title: row.name, description },
  };
}

export default async function VenueDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const row = await loadVenue(slug);

  if (!row) {
    notFound();
  }

  // Viewing is public; rating, reviewing and photo upload still require
  // sign-in (enforced server-side by requireMember in those actions).
  const session = await getUser();

  const [reviews, ownRow] = await Promise.all([
    listVenueReviews(row.id),
    session ? getUserRatingForVenue(row.id, session.id) : null,
  ]);

  const venue: Venue = toVenue(row);
  const backPath = safeInternalPath(query.from);

  return (
    <VenueDetail
      backPath={backPath}
      authError={query.auth_error === "1"}
      isAdmin={session?.profile.role === "admin"}
      ownRating={
        ownRow
          ? {
              stars: Number(ownRow.stars),
              reviewText: ownRow.reviewText,
              status: ownRow.status,
              removedReason: ownRow.removedReason,
            }
          : null
      }
      reviews={reviews.map((review) => ({
        id: review.id,
        userId: review.userId,
        stars: review.stars,
        reviewText: review.reviewText,
        status: review.status,
        removedReason: review.removedReason,
        displayName: review.displayName,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      }))}
      userId={session?.id ?? null}
      venue={venue}
    />
  );
}
