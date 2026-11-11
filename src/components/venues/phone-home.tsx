"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePostHog } from "posthog-js/react";

import { CUISINES, CUISINE_KEYS, type CuisineKey } from "@/config/cuisines";
import {
  MAP_ZONES,
  MAP_ZONE_KEYS_SORTED,
  type MapZoneKey,
} from "@/config/map-zones";
import {
  PhoneCardCarousel,
  type PhoneCardItem,
} from "@/components/venues/phone-card-carousel";
import {
  PhoneSearchField,
  PhoneSearchResults,
} from "@/components/venues/phone-search";
import { AnalyticsEvent } from "@/lib/analytics";
import { useMinuteClock } from "@/lib/use-minute-clock";
import { CLOSING_SOON_MINUTES } from "@/lib/hours";
import type { LatLng } from "@/lib/geo";
import {
  sortVenues,
  type SortBand,
  type SortedItem,
  type VenueSort,
} from "@/lib/venue-sort";
import { distanceMap } from "@/components/venues/venue-sorted-list";
import type { Venue, VenueFilters } from "@/lib/venues";

const CARD_LIMIT = 20;

type MenuKey = "filters";

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

/** "Mon 9:40 PM" in campus time. */
export function PhoneClock() {
  const now = useMinuteClock();
  const tz = "America/New_York";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return (
    <time className="phone-clock tabular" suppressHydrationWarning>
      {day} {time}
    </time>
  );
}

/**
 * Phone home's bottom stack over the map: chips (or the search field),
 * the card carousel, and "See all". Phone only; desktop never renders it.
 */
export function PhoneHome({
  venues,
  visibleVenues,
  viewVenues,
  sort,
  location,
  filters,
  onFiltersChange,
  onClearFilters,
  selectedId,
  backPath,
  onSelectCard,
  onPickSearch,
  onSeeAll,
  locateSlotRef,
}: {
  venues: Venue[];
  visibleVenues: Venue[];
  /** Filtered venues inside the map's visible box. */
  viewVenues: Venue[];
  sort: VenueSort;
  location: LatLng | null;
  filters: VenueFilters;
  onFiltersChange: (filters: VenueFilters) => void;
  onClearFilters: () => void;
  selectedId: string | null;
  backPath: string;
  onSelectCard: (venueId: string) => void;
  onPickSearch: (venueId: string) => void;
  onSeeAll: () => void;
  locateSlotRef: (node: HTMLDivElement | null) => void;
}) {
  const now = useMinuteClock();
  const posthog = usePostHog();
  const stackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searching, setSearching] = useState(
    () => filters.query.trim().length > 0,
  );
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);

  // The cards are the venues on screen (the map drives the set), in the
  // list's current sort order.
  const cards = useMemo<PhoneCardItem[]>(() => {
    const toCard = (item: SortedItem, key: SortBand): PhoneCardItem => ({
      venue: item.venue,
      minutesLeft: item.minutesLeft,
      time: item.closesAt,
      opensDayOffset: null,
      group:
        item.minutesLeft === null
          ? key === "unknown"
            ? "unknown"
            : "later"
          : item.minutesLeft < CLOSING_SOON_MINUTES
            ? "closing"
            : "open",
    });
    const all = sortVenues(
      viewVenues,
      now,
      sort,
      distanceMap(viewVenues, location),
    ).flatMap((group) => group.items.map((item) => toCard(item, group.key)));
    const shown = all.slice(0, CARD_LIMIT);
    // A pin tapped beyond the first 20, or panned off screen, keeps its card.
    if (selectedId && !shown.some((item) => item.venue.id === selectedId)) {
      const venue = venues.find((entry) => entry.id === selectedId);
      if (venue) {
        const [group] = sortVenues([venue], now, sort, new Map());
        const item = group?.items[0];
        if (item && group) shown.push(toCard(item, group.key));
      }
    }
    return shown;
  }, [viewVenues, venues, now, sort, location, selectedId]);

  // Keep the stack (and the suggestions) above the on-screen keyboard.
  useEffect(() => {
    const viewport = window.visualViewport;
    const stack = stackRef.current;
    if (!viewport || !stack || !searching) return;
    function sync() {
      if (!viewport || !stack) return;
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      stack.style.setProperty("--phone-kb", `${inset}px`);
      // Header + search row + gaps sit between the panel and the top.
      stack.style.setProperty(
        "--phone-panel-max",
        `${Math.max(120, viewport.height - 160)}px`,
      );
    }
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      stack.style.removeProperty("--phone-kb");
      stack.style.removeProperty("--phone-panel-max");
    };
  }, [searching]);

  function setQuery(query: string) {
    onFiltersChange({ ...filters, query });
  }

  function startSearch() {
    // Focus inside the tap itself so iOS opens the keyboard.
    flushSync(() => {
      setOpenMenu(null);
      setSearching(true);
    });
    inputRef.current?.focus();
  }

  function cancelSearch() {
    setQuery("");
    setSearching(false);
  }

  function pickResult(venueId: string) {
    inputRef.current?.blur();
    setSearching(false);
    onPickSearch(venueId);
  }

  function toggleBoolean(key: "openNow" | "isHalal") {
    const value = !filters[key];
    posthog.capture(AnalyticsEvent.FilterApplied, { filter: key, value });
    onFiltersChange({ ...filters, [key]: value });
  }

  function toggleCuisine(key: CuisineKey) {
    const selected = filters.cuisines.includes(key);
    posthog.capture(AnalyticsEvent.FilterApplied, {
      filter: "cuisine",
      value: key,
      active: !selected,
    });
    onFiltersChange({ ...filters, cuisines: toggle(filters.cuisines, key) });
  }

  function toggleZone(key: MapZoneKey) {
    const selected = filters.zones.includes(key);
    posthog.capture(AnalyticsEvent.FilterApplied, {
      filter: "zone",
      value: key,
      active: !selected,
    });
    onFiltersChange({ ...filters, zones: toggle(filters.zones, key) });
  }

  function chipClass(active: boolean) {
    return active ? "chip chip-active phone-chip" : "chip phone-chip";
  }

  return (
    <div
      className={searching ? "phone-stack phone-stack-searching" : "phone-stack"}
      ref={stackRef}
    >
      <div className="phone-locate-slot" ref={locateSlotRef} />
      {searching ? (
        <>
          <PhoneSearchResults
            filters={filters}
            now={now}
            onPick={pickResult}
            onQuery={setQuery}
            venues={venues}
          />
          <PhoneSearchField
            inputRef={inputRef}
            onCancel={cancelSearch}
            onQuery={setQuery}
            query={filters.query}
          />
        </>
      ) : (
        <>
          <div aria-label="Venue filters" className="phone-row phone-chips" role="group">
            <button
              aria-label="Search food or a place"
              className="phone-search-button"
              onClick={startSearch}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
                viewBox="0 0 20 20"
                width="20"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m13.5 13.5 4 4" />
              </svg>
            </button>
            <button
              aria-pressed={filters.openNow}
              className={chipClass(filters.openNow)}
              onClick={() => toggleBoolean("openNow")}
              type="button"
            >
              Open now
            </button>
            <button
              aria-pressed={filters.isHalal}
              className={chipClass(filters.isHalal)}
              onClick={() => toggleBoolean("isHalal")}
              type="button"
            >
              Halal
            </button>
            <button
              aria-expanded={openMenu === "filters"}
              className={chipClass(
                filters.cuisines.length + filters.zones.length > 0 ||
                  openMenu === "filters",
              )}
              onClick={() =>
                setOpenMenu((current) => (current === "filters" ? null : "filters"))
              }
              type="button"
            >
              Filters
              {filters.cuisines.length + filters.zones.length
                ? ` · ${filters.cuisines.length + filters.zones.length}`
                : ""}
            </button>
          </div>
          {openMenu ? (
            <>
              <div aria-label="Cuisines" className="phone-row phone-options" role="group">
                {CUISINE_KEYS.map((key) => (
                  <button
                    aria-pressed={filters.cuisines.includes(key)}
                    className={chipClass(filters.cuisines.includes(key))}
                    key={key}
                    onClick={() => toggleCuisine(key)}
                    type="button"
                  >
                    {CUISINES[key].label}
                  </button>
                ))}
              </div>
              <div aria-label="Zones" className="phone-row phone-options" role="group">
                {MAP_ZONE_KEYS_SORTED.map((key) => (
                  <button
                    aria-pressed={filters.zones.includes(key)}
                    className={chipClass(filters.zones.includes(key))}
                    key={key}
                    onClick={() => toggleZone(key)}
                    type="button"
                  >
                    {MAP_ZONES[key].label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <PhoneCardCarousel
              backPath={backPath}
              items={cards}
              onClearFilters={onClearFilters}
              onSelect={onSelectCard}
              selectedId={selectedId}
            />
          )}
          <button className="phone-see-all" onClick={onSeeAll} type="button">
            {`See all ${visibleVenues.length} ${visibleVenues.length === 1 ? "place" : "places"}`}
          </button>
        </>
      )}
    </div>
  );
}
