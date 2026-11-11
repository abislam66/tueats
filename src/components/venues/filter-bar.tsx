"use client";

import { type FocusEvent as ReactFocusEvent, useId, useState } from "react";
import { usePostHog } from "posthog-js/react";

import { CUISINES, CUISINE_KEYS, type CuisineKey } from "@/config/cuisines";
import {
  MAP_ZONES,
  MAP_ZONE_KEYS_SORTED,
  type MapZoneKey,
} from "@/config/map-zones";
import { Button, Chip, Input } from "@/components/ui/primitives";
import { AnalyticsEvent } from "@/lib/analytics";
import type { VenueFilters } from "@/lib/venues";

type FilterMenuKey = "cuisine" | "zone";

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function FilterBar({
  filters,
  onChange,
  onClear,
  active,
  searchPlaceholder = "Search food or a place",
  onSearchFocus,
  onSearchBlur,
  sortLabel,
  onOpenSort,
}: {
  filters: VenueFilters;
  onChange: (filters: VenueFilters) => void;
  /** Resets query/filters/zone back to the default unfiltered state. */
  onClear: () => void;
  /** Whether any query/filter/zone is currently non-default. */
  active: boolean;
  searchPlaceholder?: string;
  /** Optional — lets a caller drive a search-suggestions dropdown. */
  onSearchFocus?: () => void;
  onSearchBlur?: (event: ReactFocusEvent<HTMLInputElement>) => void;
  /** Desktop pane: shows a "Sort: …" chip that opens the sort sheet. */
  sortLabel?: string;
  onOpenSort?: () => void;
}) {
  // Menu options expand inline below the chip row — an in-panel drawer
  // that pushes the results down. Never a floating popover over the list.
  const [openMenu, setOpenMenu] = useState<FilterMenuKey | null>(null);
  // The last menu keeps rendering while the drawer collapses, so closing
  // animates instead of snapping empty.
  const [renderedMenu, setRenderedMenu] = useState<FilterMenuKey>("cuisine");
  const drawerId = useId();
  const posthog = usePostHog();

  function update<K extends keyof VenueFilters>(
    key: K,
    value: VenueFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  // Boolean chips only — search ("query") gets its own debounced "search
  // performed" event in VenueExplorer, and cuisine/zone tags capture
  // themselves below (their "value" is the tag, not a boolean).
  function toggleBoolean(
    key: "openNow" | "isHalal" | "isVeganFriendly" | "isCafe",
  ) {
    const value = !filters[key];
    posthog.capture(AnalyticsEvent.FilterApplied, { filter: key, value });
    update(key, value);
  }

  function toggleMenu(menu: FilterMenuKey) {
    setOpenMenu((current) => (current === menu ? null : menu));
    setRenderedMenu(menu);
  }

  function menuChipClass(menu: FilterMenuKey, count: number) {
    return ["chip", (count > 0 || openMenu === menu) && "chip-active"]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className="filter-area">
      <label className="search-wrap">
        <span className="search-icon" aria-hidden="true">
          /
        </span>
        <span className="sr-only">Search venues or cuisines</span>
        <Input
          onBlur={onSearchBlur}
          onChange={(event) => update("query", event.target.value)}
          onFocus={onSearchFocus}
          placeholder={searchPlaceholder}
          type="search"
          value={filters.query}
        />
      </label>
      <div className="filter-row">
        <div className="filter-scroll" aria-label="Venue filters">
          <Chip
            active={filters.openNow}
            onClick={() => toggleBoolean("openNow")}
          >
            Open now
          </Chip>
          <Chip
            active={filters.isHalal}
            onClick={() => toggleBoolean("isHalal")}
          >
            Halal
          </Chip>
          <Chip
            active={filters.isVeganFriendly}
            onClick={() => toggleBoolean("isVeganFriendly")}
          >
            Vegan Friendly
          </Chip>
          <Chip active={filters.isCafe} onClick={() => toggleBoolean("isCafe")}>
            Café
          </Chip>
          <button
            aria-controls={drawerId}
            aria-expanded={openMenu === "cuisine"}
            className={menuChipClass("cuisine", filters.cuisines.length)}
            onClick={() => toggleMenu("cuisine")}
            type="button"
          >
            Cuisine
            {filters.cuisines.length ? ` · ${filters.cuisines.length}` : ""}
          </button>
          <button
            aria-controls={drawerId}
            aria-expanded={openMenu === "zone"}
            className={menuChipClass("zone", filters.zones.length)}
            onClick={() => toggleMenu("zone")}
            type="button"
          >
            Zone{filters.zones.length ? ` · ${filters.zones.length}` : ""}
          </button>
          {active ? (
            <Button
              className="filter-clear-button"
              onClick={onClear}
              variant="ghost"
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        {sortLabel && onOpenSort ? (
          <button
            aria-haspopup="dialog"
            className="chip"
            onClick={onOpenSort}
            type="button"
          >
            Sort: {sortLabel}
          </button>
        ) : null}
      </div>
      <div
        className={
          openMenu ? "filter-drawer filter-drawer-open" : "filter-drawer"
        }
        id={drawerId}
        inert={openMenu === null}
      >
        <div className="filter-drawer-clip">
          {/* Horizontal multi-select: tap toggles; cherry fill = selected. */}
          <div className="filter-options">
            {renderedMenu === "cuisine"
              ? CUISINE_KEYS.map((key) => {
                  const selected = filters.cuisines.includes(key);
                  return (
                    <button
                      aria-pressed={selected}
                      className={
                        selected
                          ? "filter-option filter-option-active"
                          : "filter-option"
                      }
                      key={key}
                      onClick={() => {
                        posthog.capture(AnalyticsEvent.FilterApplied, {
                          filter: "cuisine",
                          value: key,
                          active: !selected,
                        });
                        update(
                          "cuisines",
                          toggle<CuisineKey>(filters.cuisines, key),
                        );
                      }}
                      type="button"
                    >
                      {CUISINES[key].label}
                    </button>
                  );
                })
              : MAP_ZONE_KEYS_SORTED.map((key) => {
                  const selected = filters.zones.includes(key);
                  return (
                    <button
                      aria-pressed={selected}
                      className={
                        selected
                          ? "filter-option filter-option-active"
                          : "filter-option"
                      }
                      key={key}
                      onClick={() => {
                        posthog.capture(AnalyticsEvent.FilterApplied, {
                          filter: "zone",
                          value: key,
                          active: !selected,
                        });
                        update("zones", toggle<MapZoneKey>(filters.zones, key));
                      }}
                      type="button"
                    >
                      {MAP_ZONES[key].label}
                    </button>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}
