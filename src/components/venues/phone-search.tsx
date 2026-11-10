"use client";

import { type ReactNode, type RefObject, useMemo } from "react";

import {
  PhoneCardTime,
  type PhoneCardItem,
} from "@/components/venues/phone-card-carousel";
import { groupVenuesByStatus, venuePlainLine } from "@/lib/venue-groups";
import { filterVenues, type Venue, type VenueFilters } from "@/lib/venues";

const RESULT_LIMIT = 20;
const QUICK_QUERIES = ["Halal", "Pizza", "Chicken", "Mexican", "Cafe"];

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return text;
  const haystack = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let index = haystack.indexOf(needle, from);
  while (index !== -1) {
    if (index > from) parts.push(text.slice(from, index));
    parts.push(
      <mark className="phone-search-hit" key={index}>
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    from = index + needle.length;
    index = haystack.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/** Open first (latest close first), then closed. Ignores Open now. */
export function searchVenues(
  venues: Venue[],
  filters: VenueFilters,
  now: Date,
): { open: PhoneCardItem[]; closed: PhoneCardItem[] } {
  const groups = groupVenuesByStatus(
    filterVenues(venues, { ...filters, openNow: false }, now),
    now,
  );
  const open: PhoneCardItem[] = [];
  const closed: PhoneCardItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const entry = { ...item, group: group.key };
      if (group.key === "open" || group.key === "closing") open.push(entry);
      else closed.push(entry);
    }
  }
  open.sort((a, b) => (b.minutesLeft ?? 0) - (a.minutesLeft ?? 0));
  return { open, closed };
}

export function PhoneSearchResults({
  venues,
  filters,
  now,
  onPick,
  onQuery,
}: {
  venues: Venue[];
  filters: VenueFilters;
  now: Date;
  onPick: (venueId: string) => void;
  onQuery: (query: string) => void;
}) {
  const query = filters.query.trim();
  const { open, closed } = useMemo(
    () => searchVenues(venues, filters, now),
    [venues, filters, now],
  );
  if (!query) return null;

  const total = open.length + closed.length;
  if (total === 0) {
    return (
      <div className="phone-search-panel phone-search-empty" role="status">
        <h2>Nothing matches “{query}”</h2>
        <p>
          Search by food, like pizza or halal, or by the place name. Closed
          places show up too.
        </p>
        <div className="phone-search-quick">
          {QUICK_QUERIES.map((word) => (
            <button
              className="chip"
              key={word}
              onClick={() => onQuery(word)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const shown = [...open, ...closed].slice(0, RESULT_LIMIT);
  return (
    <div aria-label="Matching places" className="phone-search-panel">
      <p aria-live="polite" className="phone-search-count">
        {total} {total === 1 ? "place" : "places"}, {open.length} open now
      </p>
      <ul className="phone-search-list">
        {shown.map((item) => {
          const line = venuePlainLine(item.venue);
          const isClosed = item.group !== "open" && item.group !== "closing";
          return (
            <li key={item.venue.id}>
              <button
                className={
                  isClosed
                    ? "phone-search-result is-closed"
                    : "phone-search-result"
                }
                onClick={() => onPick(item.venue.id)}
                type="button"
              >
                <span className="phone-card-text">
                  <span className="phone-search-name">
                    <Highlight query={query} text={item.venue.name} />
                  </span>
                  {line ? (
                    <span className="phone-card-line">
                      <Highlight query={query} text={line} />
                    </span>
                  ) : null}
                </span>
                <PhoneCardTime item={item} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PhoneSearchField({
  inputRef,
  query,
  onQuery,
  onCancel,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (query: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="phone-row phone-search-row">
      <label className="phone-search-field">
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
          viewBox="0 0 20 20"
          width="18"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m13.5 13.5 4 4" />
        </svg>
        <span className="sr-only">Search food or a place</span>
        <input
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search food or a place"
          ref={inputRef}
          type="search"
          value={query}
        />
      </label>
      <button className="phone-search-cancel" onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  );
}
