"use client";

import { useEffect, useMemo, useRef } from "react";

import { CLOSING_SOON_MINUTES, formatClockTime } from "@/lib/hours";
import { formatMiles, haversineMiles, type LatLng } from "@/lib/geo";
import { venuePlainLine } from "@/lib/venue-groups";
import {
  sortVenues,
  type SortedGroup,
  type SortedItem,
  type VenueSort,
} from "@/lib/venue-sort";
import type { Venue } from "@/lib/venues";

export function distanceMap(
  venues: Venue[],
  location: LatLng | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!location) return map;
  for (const venue of venues) {
    map.set(
      venue.id,
      haversineMiles(location, { lat: venue.lat, lng: venue.lng }),
    );
  }
  return map;
}

function RowTime({ item, group }: { item: SortedItem; group: SortedGroup }) {
  if (item.minutesLeft !== null && item.closesAt) {
    if (item.minutesLeft < CLOSING_SOON_MINUTES) {
      return (
        <span className="pl-time">
          <span className="pl-left">{item.minutesLeft} min left</span>
        </span>
      );
    }
    return (
      <span className="pl-time">
        <span className="pl-until">until</span>
        <time className="pl-clock" suppressHydrationWarning>
          {formatClockTime(item.closesAt)}
        </time>
      </span>
    );
  }
  return (
    <span className="pl-time">
      <span className="pl-muted">
        {group.key === "unknown" ? "Hours not posted yet" : "Closed now"}
      </span>
    </span>
  );
}

function Row({
  item,
  group,
  miles,
  selected,
  highlighted,
  onOpen,
  onPrefetch,
  onHover,
}: {
  item: SortedItem;
  group: SortedGroup;
  miles: number | null;
  selected: boolean;
  highlighted: boolean;
  onOpen: (venue: Venue) => void;
  onPrefetch?: (venue: Venue) => void;
  onHover?: (venueId: string | null) => void;
}) {
  const { venue } = item;
  const rowRef = useRef<HTMLLIElement>(null);
  const line = venuePlainLine(venue);
  const cashOnly = venue.acceptsCard === false;

  useEffect(() => {
    if (!selected || !rowRef.current) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    rowRef.current.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [selected]);

  return (
    <li ref={rowRef}>
      <button
        aria-current={selected ? "true" : undefined}
        className={[
          "pl-row",
          selected && "pl-row-selected",
          highlighted && !selected && "pl-row-highlighted",
        ]
          .filter(Boolean)
          .join(" ")}
        onBlur={() => onHover?.(null)}
        onClick={() => onOpen(venue)}
        onFocus={() => {
          onPrefetch?.(venue);
          onHover?.(venue.id);
        }}
        onMouseEnter={() => onHover?.(venue.id)}
        onMouseLeave={() => onHover?.(null)}
        onPointerDown={() => onPrefetch?.(venue)}
        type="button"
      >
        <span className="pl-main">
          <span className="pl-name">{venue.name}</span>
          {miles !== null || line ? (
            <span className="pl-line">
              {miles !== null ? (
                <span className="pl-miles">{formatMiles(miles)}</span>
              ) : null}
              {miles !== null && line ? " · " : null}
              {line}
            </span>
          ) : null}
          {venue.isHalal || cashOnly ? (
            <span className="pl-tags">
              {venue.isHalal ? <span className="pl-tag">Halal</span> : null}
              {cashOnly ? <span className="pl-tag">Cash only</span> : null}
            </span>
          ) : null}
        </span>
        <RowTime group={group} item={item} />
      </button>
    </li>
  );
}

/**
 * The grouped, sorted list shared by the phone home and the desktop pane.
 * Distance shows (first on the second line) only when sorted by Nearest.
 */
export function SortedVenueList({
  venues,
  now,
  sort,
  location,
  includeClosed,
  selectedId = null,
  highlightedId = null,
  onOpen,
  onPrefetch,
  onHover,
  onClearFilters,
}: {
  venues: Venue[];
  now: Date;
  sort: VenueSort;
  location: LatLng | null;
  includeClosed: boolean;
  selectedId?: string | null;
  highlightedId?: string | null;
  onOpen: (venue: Venue) => void;
  onPrefetch?: (venue: Venue) => void;
  onHover?: (venueId: string | null) => void;
  onClearFilters: () => void;
}) {
  const distances = useMemo(
    () => distanceMap(venues, location),
    [venues, location],
  );
  // The selected venue is pinned first; the rest keep their sorted order.
  const pinned = useMemo(() => {
    const venue = selectedId
      ? venues.find((entry) => entry.id === selectedId)
      : undefined;
    if (!venue) return null;
    const [group] = sortVenues([venue], now, sort, distances);
    const item = group?.items[0];
    return group && item ? { group, item } : null;
  }, [venues, selectedId, now, sort, distances]);
  const groups = useMemo(
    () =>
      sortVenues(
        pinned ? venues.filter((v) => v.id !== pinned.item.venue.id) : venues,
        now,
        sort,
        distances,
        { includeClosed },
      ),
    [venues, pinned, now, sort, distances, includeClosed],
  );

  if (groups.length === 0 && !pinned) {
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
      {pinned ? (
        <section aria-label="Selected place">
          <ul className="pl-rows">
            <Row
              group={pinned.group}
              highlighted={false}
              item={pinned.item}
              miles={
                sort === "nearest"
                  ? (distances.get(pinned.item.venue.id) ?? null)
                  : null
              }
              onHover={onHover}
              onOpen={onOpen}
              onPrefetch={onPrefetch}
              selected
            />
          </ul>
        </section>
      ) : null}
      {groups.map((group) => (
        <section aria-label={group.title} key={group.key}>
          <h2 className="pl-group-title">{group.title}</h2>
          <ul className="pl-rows">
            {group.items.map((item) => (
              <Row
                group={group}
                highlighted={highlightedId === item.venue.id}
                item={item}
                key={item.venue.id}
                miles={
                  sort === "nearest"
                    ? (distances.get(item.venue.id) ?? null)
                    : null
                }
                onHover={onHover}
                onOpen={onOpen}
                onPrefetch={onPrefetch}
                selected={selectedId === item.venue.id}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
