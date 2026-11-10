"use client";

import { useEffect, useMemo, useRef } from "react";

import { EmptyState } from "@/components/ui/primitives";
import type { Venue } from "@/lib/venues";
import {
  CuisineTags,
  HalalTag,
  OpenStatus,
  PaymentTag,
} from "@/components/venues/venue-bits";
import { formatClockTime } from "@/lib/hours";
import { formatStudentRating } from "@/lib/ratings";
import { useMinuteClock } from "@/lib/use-minute-clock";
import {
  groupVenuesByStatus,
  venuePlainLine,
  type GroupedVenue,
  type VenueGroupKey,
} from "@/lib/venue-groups";

const WEEKDAY_SHORT = ["today", "tomorrow"];

function RowTime({
  item,
  group,
}: {
  item: GroupedVenue;
  group: VenueGroupKey;
}) {
  if (!item.time) return null;
  const time = formatClockTime(item.time);
  let caption: React.ReactNode;
  if (group === "closing") {
    caption = (
      <span className="venue-row-caption is-warning">
        {item.minutesLeft} min left
      </span>
    );
  } else if (group === "open") {
    caption = <span className="venue-row-caption is-open">until</span>;
  } else {
    const day =
      item.opensDayOffset !== null && item.opensDayOffset > 0
        ? (WEEKDAY_SHORT[item.opensDayOffset] ?? "later")
        : null;
    caption = (
      <span className="venue-row-caption">
        {day ? `opens ${day}` : "opens"}
      </span>
    );
  }
  return (
    <span className="venue-row-time">
      {caption}
      <time className={`venue-row-clock is-${group}`} suppressHydrationWarning>
        {time}
      </time>
    </span>
  );
}

/**
 * Rows select the venue on the map (desktop: fly-to + mini-card; phone:
 * the sheet swaps to the venue preview). `/eat/[slug]` is reached only
 * from the mini-card / preview. `onHover` just highlights the pin.
 */
export function VenueRow({
  item,
  group,
  selected = false,
  highlighted = false,
  onSelect,
  onHover,
}: {
  item: GroupedVenue;
  group: VenueGroupKey;
  selected?: boolean;
  highlighted?: boolean;
  onSelect: (venueId: string) => void;
  onHover?: (venueId: string | null) => void;
}) {
  const { venue } = item;
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!selected || !rowRef.current) return;
    rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const line = venuePlainLine(venue);
  const tagged = venue.acceptsCard === false || venue.isHalal;

  return (
    <li ref={rowRef}>
      <button
        aria-current={selected ? "true" : undefined}
        className={[
          "venue-row",
          selected && "venue-row-selected",
          highlighted && !selected && "venue-row-highlighted",
        ]
          .filter(Boolean)
          .join(" ")}
        onBlur={() => onHover?.(null)}
        onClick={() => onSelect(venue.id)}
        onFocus={() => onHover?.(venue.id)}
        onMouseEnter={() => onHover?.(venue.id)}
        onMouseLeave={() => onHover?.(null)}
        type="button"
      >
        <span className="venue-row-main">
          <span className="venue-row-name">{venue.name}</span>
          {line ? <span className="venue-row-line">{line}</span> : null}
          {tagged || venue.studentRating ? (
            <span className="venue-tags">
              <PaymentTag card={venue.acceptsCard} />
              <HalalTag isHalal={venue.isHalal} />
              {venue.studentRating ? (
                <span className="venue-row-rating">
                  {formatStudentRating(venue.studentRating, "list")}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <RowTime group={group} item={item} />
      </button>
    </li>
  );
}

export function VenueList({
  venues,
  onClear,
  onSelect,
  openNowActive = false,
  selectedId = null,
  hoveredId = null,
  onHover,
}: {
  venues: Venue[];
  onClear: () => void;
  onSelect: (venueId: string) => void;
  openNowActive?: boolean;
  selectedId?: string | null;
  hoveredId?: string | null;
  onHover?: (venueId: string | null) => void;
}) {
  const now = useMinuteClock();
  const groups = useMemo(() => groupVenuesByStatus(venues, now), [venues, now]);

  if (venues.length === 0) {
    return (
      <EmptyState
        action={
          <button
            className="button button-primary"
            onClick={onClear}
            type="button"
          >
            Clear filters
          </button>
        }
        description="Clear filters to see every place near campus."
        title={openNowActive ? "Nothing open matches" : "Nothing matches"}
      />
    );
  }

  return (
    <div className="venue-groups">
      {groups.map((group) => (
        <section aria-labelledby={`group-${group.key}`} key={group.key}>
          <h2 className="venue-group-title" id={`group-${group.key}`}>
            {group.title}
          </h2>
          <ul className="venue-list">
            {group.items.map((item) => (
              <VenueRow
                group={group.key}
                highlighted={item.venue.id === hoveredId}
                item={item}
                key={item.venue.id}
                onHover={onHover}
                onSelect={onSelect}
                selected={item.venue.id === selectedId}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function VenueMiniCard({ venue }: { venue: Venue }) {
  return (
    <article className="venue-mini-card">
      <h3>{venue.name}</h3>
      <CuisineTags cuisines={venue.cuisines} />
      <OpenStatus venue={venue} />
    </article>
  );
}
