"use client";

import type { FocusEvent as ReactFocusEvent } from "react";

import { FilterBar } from "@/components/venues/filter-bar";
import type { VenueFilters } from "@/lib/venues";

export type SearchSuggestion = {
  id: string;
  name: string;
  location: string;
};

/**
 * Floating search+filters card over the map — the map-first landing's
 * replacement for the old always-visible list pane's search bar. Reuses
 * FilterBar as-is; the placement (absolute, over the map) and, while the
 * field has focus and a query, a suggestions dropdown are what's added
 * here. Picking a suggestion selects that venue on the map (fly-to +
 * popup) via the parent — it never navigates to /eat/[slug].
 */
export function MapSearchOverlay({
  filters,
  onChange,
  onClear,
  active,
  suggestions,
  showSuggestions,
  notFound,
  onPickSuggestion,
  onSearchFocus,
  onSearchBlur,
  sortLabel,
  onOpenSort,
}: {
  filters: VenueFilters;
  onChange: (filters: VenueFilters) => void;
  onClear: () => void;
  active: boolean;
  suggestions: SearchSuggestion[];
  showSuggestions: boolean;
  notFound: boolean;
  onPickSuggestion: (venueId: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: (event: ReactFocusEvent<HTMLInputElement>) => void;
  sortLabel?: string;
  onOpenSort?: () => void;
}) {
  return (
    <div className="map-search-overlay">
      <FilterBar
        active={active}
        filters={filters}
        onChange={onChange}
        onClear={onClear}
        onSearchBlur={onSearchBlur}
        onOpenSort={onOpenSort}
        onSearchFocus={onSearchFocus}
        sortLabel={sortLabel}
        searchPlaceholder="tueats.co"
      />
      {showSuggestions ? (
        <div aria-label="Matching places" className="search-suggestions">
          {notFound ? (
            <p className="search-suggestion-empty">Restaurant not found</p>
          ) : (
            suggestions.map((suggestion) => (
              <button
                className="search-suggestion"
                key={suggestion.id}
                onClick={() => onPickSuggestion(suggestion.id)}
                // Keep focus on the search input through the click so it
                // never blurs the list out from under the pointer; the
                // parent's blur guard covers the keyboard path.
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span className="search-suggestion-name">
                  {suggestion.name}
                </span>
                <span className="search-suggestion-where">
                  {suggestion.location}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
