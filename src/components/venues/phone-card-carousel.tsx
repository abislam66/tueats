"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";

import { formatClockTime } from "@/lib/hours";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import {
  venuePlainLine,
  type GroupedVenue,
  type VenueGroupKey,
} from "@/lib/venue-groups";

export type PhoneCardItem = GroupedVenue & { group: VenueGroupKey };

// Matches .phone-cards padding-left; cards snap to this inset.
const SNAP_INSET_PX = 16;
const TWEEN_MS = 180;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PhoneCardTime({ item }: { item: PhoneCardItem }) {
  if ((item.group === "open" || item.group === "closing") && item.time) {
    return (
      <span className="phone-card-time">
        <span className="phone-card-until">until</span>
        <time className="phone-card-clock" suppressHydrationWarning>
          {formatClockTime(item.time)}
        </time>
      </span>
    );
  }
  return (
    <span className="phone-card-time">
      <span className="phone-card-closed">
        {item.group === "unknown" ? "Hours unknown" : "Closed now"}
      </span>
    </span>
  );
}

function CardBody({ item }: { item: PhoneCardItem }) {
  const line = venuePlainLine(item.venue);
  return (
    <span className="phone-card-body">
      <span className="phone-card-text">
        <span className="phone-card-name">{item.venue.name}</span>
        {line ? <span className="phone-card-line">{line}</span> : null}
      </span>
      <PhoneCardTime item={item} />
    </span>
  );
}

/**
 * Horizontal scroll-snap cards. Only a tap selects: swiping never changes
 * the selection or moves the map. A selection made anywhere (card tap, pin
 * tap, search) scrolls its card into place.
 */
export function PhoneCardCarousel({
  items,
  selectedId,
  backPath,
  onSelect,
  onClearFilters,
}: {
  items: PhoneCardItem[];
  selectedId: string | null;
  backPath: string;
  onSelect: (venueId: string) => void;
  onClearFilters: () => void;
}) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const tweenFrame = useRef<number | undefined>(undefined);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const itemsKey = items.map((item) => item.venue.id).join("|");

  function cardX(venueId: string): number | null {
    const card = cardRefs.current.get(venueId);
    return card ? card.offsetLeft - SNAP_INSET_PX : null;
  }

  function scrollToX(x: number, smooth: boolean) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const target = Math.max(0, Math.min(max, x));
    const from = scroller.scrollLeft;
    if (Math.abs(target - from) < 1) return;
    if (tweenFrame.current) cancelAnimationFrame(tweenFrame.current);
    if (!smooth) {
      scroller.scrollLeft = target;
      return;
    }
    // Snap would fight a frame-by-frame scroll; restore it on landing.
    scroller.style.scrollSnapType = "none";
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - progress) ** 3;
      scroller.scrollLeft = from + (target - from) * eased;
      if (progress < 1) {
        tweenFrame.current = requestAnimationFrame(step);
      } else {
        scroller.style.scrollSnapType = "";
        tweenFrame.current = undefined;
      }
    };
    tweenFrame.current = requestAnimationFrame(step);
  }

  // A new card set (filters changed, map panned): jump without animating.
  useLayoutEffect(() => {
    const x = selectedIdRef.current ? cardX(selectedIdRef.current) : null;
    scrollToX(x ?? 0, false);
  }, [itemsKey]);

  useEffect(() => {
    if (!selectedId) return;
    const x = cardX(selectedId);
    if (x !== null) scrollToX(x, !prefersReducedMotion());
  }, [selectedId]);

  useEffect(
    () => () => {
      if (tweenFrame.current) cancelAnimationFrame(tweenFrame.current);
    },
    [],
  );

  if (items.length === 0) {
    return (
      <div className="phone-cards-empty">
        <p>No places match these filters.</p>
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
    <ul aria-label="Places" className="phone-cards" ref={scrollerRef}>
      {items.map((item) => {
        const { venue } = item;
        const selected = venue.id === selectedId;
        return (
          <li
            className="phone-card-slot"
            key={venue.id}
            ref={(node) => {
              if (node) cardRefs.current.set(venue.id, node);
              else cardRefs.current.delete(venue.id);
            }}
          >
            {selected ? (
              <div aria-current="true" className="phone-card phone-card-selected">
                <CardBody item={item} />
                <span className="phone-card-actions">
                  <a
                    className="button button-primary"
                    href={googleMapsDirectionsUrl(venue)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Get directions
                  </a>
                  <Link
                    className="button button-secondary"
                    href={`/eat/${venue.slug}?from=${encodeURIComponent(backPath)}`}
                  >
                    Hours
                  </Link>
                </span>
              </div>
            ) : (
              <button
                className="phone-card"
                onClick={() => onSelect(venue.id)}
                type="button"
              >
                <CardBody item={item} />
              </button>
            )}
          </li>
        );
      })}
      <li aria-hidden="true" className="phone-cards-end" />
    </ul>
  );
}
