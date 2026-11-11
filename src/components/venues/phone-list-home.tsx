"use client";

import { useState } from "react";
import { usePostHog } from "posthog-js/react";

import { CUISINES, CUISINE_KEYS, type CuisineKey } from "@/config/cuisines";
import {
  MAP_ZONES,
  MAP_ZONE_KEYS_SORTED,
  type MapZoneKey,
} from "@/config/map-zones";
import { PhoneClock } from "@/components/venues/phone-home";
import {
  PHONE_SORT_LABELS,
  PhoneList,
  type PhoneSort,
} from "@/components/venues/phone-list";
import { AnalyticsEvent } from "@/lib/analytics";
import { useGrantedLocation } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { useMinuteClock } from "@/lib/use-minute-clock";
import { filterVenues, type Venue, type VenueFilters } from "@/lib/venues";

type MenuKey = "cuisine" | "zone" | "sort";

const SORT_ORDER: PhoneSort[] = ["nearest", "closing", "latest"];

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

/**
 * Phone home, list first: title + clock, search, one chip row, the grouped
 * list, and a Map pill. Rendered below 64rem only.
 */
export function PhoneListHome({
  venues,
  visibleVenues,
  filters,
  onFiltersChange,
  onClearFilters,
  onOpenVenue,
  onPrefetchVenue,
  onMap,
  onPlaces,
}: {
  venues: Venue[];
  visibleVenues: Venue[];
  filters: VenueFilters;
  onFiltersChange: (filters: VenueFilters) => void;
  onClearFilters: () => void;
  onOpenVenue: (venue: Venue) => void;
  onPrefetchVenue: (venue: Venue) => void;
  onMap: () => void;
  onPlaces: () => void;
}) {
  const now = useMinuteClock();
  const posthog = usePostHog();
  const location = useGrantedLocation();
  const [sort, setSort] = useState<PhoneSort>("latest");
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);

  const effectiveSort: PhoneSort =
    sort === "nearest" && !location ? "latest" : sort;
  const openCount = visibleVenues.filter(
    (venue) => venue.status === "published" && isOpenNow(venue.hours, now),
  ).length;
  const openNowCount = filterVenues(
    venues,
    { ...filters, openNow: true },
    now,
  ).length;

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

  function menuChip(menu: MenuKey) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function chip(active: boolean) {
    return active ? "chip chip-active pl-chip" : "chip pl-chip";
  }

  return (
    <div className="pl-home">
      <div className="pl-scroll">
        <div className="pl-top">
          <h2 className="pl-title" suppressHydrationWarning>
            {openCount} {openCount === 1 ? "place" : "places"} open
          </h2>
          <div className="pl-subtitle">
            <PhoneClock />
            <button className="text-link pl-top-rated" onClick={onPlaces} type="button">
              Top rated
            </button>
          </div>
        </div>

        <label className="pl-search">
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
          <span className="sr-only">Search food or a place</span>
          <input
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) =>
              onFiltersChange({ ...filters, query: event.target.value })
            }
            placeholder="Search food or a place"
            type="search"
            value={filters.query}
          />
        </label>

        <div aria-label="Venue filters" className="pl-chips" role="group">
          <button
            aria-pressed={filters.openNow}
            className={chip(filters.openNow)}
            onClick={() => toggleBoolean("openNow")}
            suppressHydrationWarning
            type="button"
          >
            Open now · {openNowCount}
          </button>
          <button
            aria-pressed={filters.isHalal}
            className={chip(filters.isHalal)}
            onClick={() => toggleBoolean("isHalal")}
            type="button"
          >
            Halal
          </button>
          <button
            aria-expanded={openMenu === "cuisine"}
            className={chip(filters.cuisines.length > 0 || openMenu === "cuisine")}
            onClick={() => menuChip("cuisine")}
            type="button"
          >
            Cuisine{filters.cuisines.length ? ` · ${filters.cuisines.length}` : ""}
          </button>
          <button
            aria-expanded={openMenu === "zone"}
            className={chip(filters.zones.length > 0 || openMenu === "zone")}
            onClick={() => menuChip("zone")}
            type="button"
          >
            Zone{filters.zones.length ? ` · ${filters.zones.length}` : ""}
          </button>
          <button
            aria-expanded={openMenu === "sort"}
            className={chip(effectiveSort !== "latest" || openMenu === "sort")}
            onClick={() => menuChip("sort")}
            type="button"
          >
            Sort
          </button>
        </div>

        {openMenu === "cuisine" ? (
          <div aria-label="Cuisines" className="pl-options" role="group">
            {CUISINE_KEYS.map((key) => (
              <button
                aria-pressed={filters.cuisines.includes(key)}
                className={chip(filters.cuisines.includes(key))}
                key={key}
                onClick={() => toggleCuisine(key)}
                type="button"
              >
                {CUISINES[key].label}
              </button>
            ))}
          </div>
        ) : null}
        {openMenu === "zone" ? (
          <div aria-label="Zones" className="pl-options" role="group">
            {MAP_ZONE_KEYS_SORTED.map((key) => (
              <button
                aria-pressed={filters.zones.includes(key)}
                className={chip(filters.zones.includes(key))}
                key={key}
                onClick={() => toggleZone(key)}
                type="button"
              >
                {MAP_ZONES[key].label}
              </button>
            ))}
          </div>
        ) : null}
        {openMenu === "sort" ? (
          <>
            <div aria-label="Sort by" className="pl-options" role="group">
              {SORT_ORDER.map((key) => {
                const disabled = key === "nearest" && !location;
                return (
                  <button
                    aria-describedby={disabled ? "pl-sort-hint" : undefined}
                    aria-pressed={effectiveSort === key}
                    className={chip(effectiveSort === key)}
                    disabled={disabled}
                    key={key}
                    onClick={() => setSort(key)}
                    type="button"
                  >
                    {PHONE_SORT_LABELS[key]}
                  </button>
                );
              })}
            </div>
            {location ? null : (
              <p className="pl-hint" id="pl-sort-hint">
                Turn on location to sort by distance.
              </p>
            )}
          </>
        ) : null}

        <PhoneList
          location={location}
          now={now}
          onClearFilters={onClearFilters}
          onOpen={onOpenVenue}
          onPrefetch={onPrefetchVenue}
          sort={effectiveSort}
          venues={visibleVenues}
        />
      </div>

      <button className="pl-map-pill" onClick={onMap} type="button">
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 20 20"
          width="20"
        >
          <path d="M7 3.5 2.5 5.5v11L7 14.5l6 2 4.5-2v-11l-4.5 2-6-2Z" />
          <path d="M7 3.5v11M13 5.5v11" />
        </svg>
        Map
      </button>
    </div>
  );
}
