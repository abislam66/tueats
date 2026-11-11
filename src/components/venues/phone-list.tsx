"use client";

import { useMemo } from "react";

import { formatClockTime } from "@/lib/hours";
import { formatMiles, haversineMiles, type LatLng } from "@/lib/geo";
import {
  groupVenuesByStatus,
  venuePlainLine,
  type GroupedVenue,
  type VenueGroup,
  type VenueGroupKey,
} from "@/lib/venue-groups";
import type { Venue } from "@/lib/venues";

export type PhoneSort = "latest" | "closing" | "nearest";

export const PHONE_SORT_LABELS: Record<PhoneSort, string> = {
  nearest: "Nearest",
  closing: "Closing soonest",
  latest: "Latest close",
};

function sortWithin(
  groups: VenueGroup[],
  sort: PhoneSort,
  distances: Map<string, number>,
): VenueGroup[] {
  if (sort === "latest") return groups;
  return groups.map((group) => {
    const items = [...group.items];
    if (sort === "closing" && group.key === "open") {
      items.sort((a, b) => (a.minutesLeft ?? 0) - (b.minutesLeft ?? 0));
    } else if (sort === "nearest") {
      items.sort(
        (a, b) =>
          (distances.get(a.venue.id) ?? Number.POSITIVE_INFINITY) -
          (distances.get(b.venue.id) ?? Number.POSITIVE_INFINITY),
      );
    }
    return { ...group, items };
  });
}

function RowTime({
  item,
  group,
}: {
  item: GroupedVenue;
  group: VenueGroupKey;
}) {
  if (group === "open" && item.time) {
    return (
      <span className="pl-time">
        <span className="pl-until">until</span>
        <time className="pl-clock" suppressHydrationWarning>
          {formatClockTime(item.time)}
        </time>
      </span>
    );
  }
  if (group === "closing" && item.time) {
    return (
      <span className="pl-time">
        <span className="pl-left">{item.minutesLeft} min left</span>
        <time className="pl-clock" suppressHydrationWarning>
          {formatClockTime(item.time)}
        </time>
      </span>
    );
  }
  if (group === "unknown") {
    return (
      <span className="pl-time">
        <span className="pl-muted">Hours not posted yet</span>
      </span>
    );
  }
  return (
    <span className="pl-time">
      <span className="pl-muted">Closed now</span>
    </span>
  );
}

function Row({
  item,
  group,
  miles,
  onOpen,
  onPrefetch,
}: {
  item: GroupedVenue;
  group: VenueGroupKey;
  miles: number | null;
  onOpen: (venue: Venue) => void;
  onPrefetch: (venue: Venue) => void;
}) {
  const { venue } = item;
  const line = venuePlainLine(venue);
  const cashOnly = venue.acceptsCard === false;
  return (
    <li>
      <button
        className="pl-row"
        onClick={() => onOpen(venue)}
        onFocus={() => onPrefetch(venue)}
        onPointerDown={() => onPrefetch(venue)}
        type="button"
      >
        <span className="pl-main">
          <span className="pl-name">{venue.name}</span>
          {line ? <span className="pl-line">{line}</span> : null}
          {venue.isHalal || cashOnly ? (
            <span className="pl-tags">
              {venue.isHalal ? <span className="pl-tag">Halal</span> : null}
              {cashOnly ? <span className="pl-tag">Cash only</span> : null}
            </span>
          ) : null}
        </span>
        <span className="pl-side">
          <RowTime group={group} item={item} />
          {miles !== null ? (
            <span className="pl-distance">{formatMiles(miles)}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function PhoneList({
  venues,
  now,
  sort,
  location,
  onOpen,
  onPrefetch,
  onClearFilters,
}: {
  venues: Venue[];
  now: Date;
  sort: PhoneSort;
  location: LatLng | null;
  onOpen: (venue: Venue) => void;
  onPrefetch: (venue: Venue) => void;
  onClearFilters: () => void;
}) {
  const distances = useMemo(() => {
    const map = new Map<string, number>();
    if (!location) return map;
    for (const venue of venues) {
      map.set(venue.id, haversineMiles(location, { lat: venue.lat, lng: venue.lng }));
    }
    return map;
  }, [venues, location]);

  const groups = useMemo(
    () => sortWithin(groupVenuesByStatus(venues, now), sort, distances),
    [venues, now, sort, distances],
  );

  if (venues.length === 0) {
    return (
      <div className="pl-empty">
        <p className="pl-empty-title">Nothing open matches.</p>
        <button
          className="button button-secondary"
          onClick={onClearFilters}
          type="button"
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="pl-groups">
      {groups.map((group) => (
        <section aria-label={group.title} key={group.key}>
          <h2 className="pl-group-title">{group.title}</h2>
          <ul className="pl-rows">
            {group.items.map((item) => (
              <Row
                group={group.key}
                item={item}
                key={item.venue.id}
                miles={distances.get(item.venue.id) ?? null}
                onOpen={onOpen}
                onPrefetch={onPrefetch}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
