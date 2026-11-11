"use client";

import {
  type FocusEvent as ReactFocusEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";

import { VenueMapLoader } from "@/components/map/venue-map-loader";
import { SiteHeader } from "@/components/layout/site-header";
import type { HeaderSession } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/primitives";
import {
  MapSearchOverlay,
  type SearchSuggestion,
} from "@/components/venues/map-search-overlay";
import { PhoneClock, PhoneHome } from "@/components/venues/phone-home";
import { PhoneListHome } from "@/components/venues/phone-list-home";
import {
  distanceMap,
  orderVenues,
  type PhoneSort,
} from "@/components/venues/phone-list";
import { PlacesOfTheWeekPanel } from "@/components/venues/places-of-the-week-panel";
import { VenueList } from "@/components/venues/venue-list";
import { AnalyticsEvent } from "@/lib/analytics";
import { useGrantedLocation } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { FIT_VENUE_COUNT, type CameraMemory } from "@/lib/map/default-camera";
import { useMinuteClock } from "@/lib/use-minute-clock";
import { venuePlaceName } from "@/lib/venue-groups";
import { DESKTOP_MEDIA_QUERY } from "@/lib/mobile-sheet-heights";
import type { Venue } from "@/lib/venues";
import {
  countUnknownHours,
  EMPTY_VENUE_FILTERS,
  filterVenues,
  parseVenueFilters,
  serializeVenueFilters,
} from "@/lib/venues";

type ViewMode = "map" | "places";

/** Cap on how many name matches the map search dropdown lists at once. */
const SEARCH_SUGGESTION_LIMIT = 6;

function ResultsPanel({
  venues,
  onClearFilters,
  unknownHours,
  filtersActive,
  openNowActive,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
  onPlaces,
}: {
  venues: Venue[];
  onClearFilters: () => void;
  unknownHours: number;
  filtersActive: boolean;
  openNowActive: boolean;
  onPlaces: () => void;
  onSelect: (venueId: string) => void;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (venueId: string | null) => void;
}) {
  return (
    <div className="results-panel">
      <div className="results-summary" aria-live="polite">
        <span>
          {venues.length} {venues.length === 1 ? "place" : "places"}
        </span>
        {unknownHours > 0 ? (
          <span className="unknown-count">
            +{unknownHours} with unknown hours
          </span>
        ) : null}
        {filtersActive ? (
          <Button
            className="clear-button"
            onClick={onClearFilters}
            variant="ghost"
          >
            Clear
          </Button>
        ) : null}
        {/* Phone header has no nav; Top rated lives here instead. */}
        <button
          className="text-link results-top-rated"
          onClick={onPlaces}
          type="button"
        >
          Top rated
        </button>
      </div>
      <VenueList
        hoveredId={hoveredId}
        onClear={onClearFilters}
        onHover={onHover}
        onSelect={onSelect}
        openNowActive={openNowActive}
        selectedId={selectedId}
        venues={venues}
      />
    </div>
  );
}

export function VenueExplorer({
  venues,
  initialQuery,
  session = null,
}: {
  venues: Venue[];
  initialQuery: string;
  session?: HeaderSession | null;
}) {
  const initialParams = useMemo(
    () => new URLSearchParams(initialQuery),
    [initialQuery],
  );
  const [filters, setFilters] = useState(() =>
    parseVenueFilters(initialParams),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const view = initialParams.get("view");
    // "hotspots" is the pre-2026-09-10 name for this view — still honored
    // so old links/bookmarks land on Places of the Week.
    return view === "places" || view === "hotspots" ? "places" : "map";
  });
  // Phone: list first. The map is one tap away ("Map" pill) and is not
  // even mounted until then.
  const [phoneView, setPhoneView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<PhoneSort>("latest");
  const location = useGrantedLocation();
  const now = useMinuteClock();
  // Survives the map unmounting (phone list <-> map), so reopening the map
  // returns to wherever the visitor left it.
  const cameraMemory = useRef<CameraMemory | null>(null);
  // On mobile, selecting a venue swaps the sheet into a preview card (no
  // room for both a browse view and a floating mini-card at once). On
  // desktop the mini-card handles the selection instead — the sheet stays
  // in whatever browse content it already had, so picking a venue never
  // silently discards an open Places board or restaurant list.
  // Starts false on every render pass (server + first client paint) so
  // hydration matches; the effect below flips it. CSS hides the sheet at
  // desktop width meanwhile, so there is no flash.
  const [isDesktop, setIsDesktop] = useState(false);
  const [locateSlot, setLocateSlot] = useState<HTMLElement | null>(null);
  const posthog = usePostHog();
  const router = useRouter();

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
    function sync() {
      setIsDesktop(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Venue pills are drawn on the map's canvas (a MapLibre symbol layer, see
  // venue-pill-layer.tsx) — not DOM elements — so autocapture is
  // structurally blind to a pin tap. This is the one interaction on the
  // site autocapture genuinely cannot see; every other custom event here
  // just adds semantic state on top of what autocapture already gets free.
  function captureVenueSelected(
    venueId: string,
    source: "map" | "list" | "search",
  ) {
    const venue = venues.find((candidate) => candidate.id === venueId);
    posthog.capture(AnalyticsEvent.VenueSelected, {
      venue_id: venueId,
      venue_type: venue?.type ?? null,
      source,
    });
  }

  // List rows hand the stage to the map: select the venue. On mobile the
  // results sheet swaps to the venue preview; on desktop the pin card
  // pops. Map-originated zone taps keep the browse sheet where it is.
  function selectFromList(venueId: string | null) {
    if (venueId) captureVenueSelected(venueId, "list");
    setSelectedId(venueId);
  }

  function selectFromMap(venueId: string | null) {
    if (venueId) captureVenueSelected(venueId, "map");
    setSelectedId(venueId);
  }

  // A search suggestion behaves like a list-row select — it never
  // navigates to /eat/[slug]. Clearing the query widens the visible set
  // back so the chosen venue survives the `selectedId`-visibility guard
  // below, and the existing map effects fly to it and open its popup /
  // mobile preview.
  function selectFromSearch(venueId: string) {
    captureVenueSelected(venueId, "search");
    setFilters((current) => ({ ...current, query: "" }));
    setSearchFocused(false);
    setSelectedId(venueId);
  }

  // Phone search ignores Open now, so a closed pick has to drop it or the
  // visibility guard below would clear the selection straight away.
  function pickFromPhoneSearch(venueId: string) {
    const venue = venues.find((candidate) => candidate.id === venueId);
    if (filters.openNow && venue && !isOpenNow(venue.hours)) {
      setFilters((current) => ({ ...current, openNow: false }));
    }
    selectFromSearch(venueId);
  }

  // Phone list rows open the place page (the same route "View details" and
  // the cards' Hours button use); the map keeps its own selection flow.
  function openPlacePage(venue: Venue) {
    captureVenueSelected(venue.id, "list");
    router.push(`/eat/${venue.slug}?from=${encodeURIComponent(backPath)}`);
  }

  function prefetchPlacePage(venue: Venue) {
    router.prefetch(`/eat/${venue.slug}`);
  }

  function showPhoneMap() {
    setPhoneView("map");
  }

  function showPhoneList() {
    setSelectedId(null);
    setPhoneView("list");
  }

  function handleSearchBlur(event: ReactFocusEvent<HTMLInputElement>) {
    // Keep the dropdown open while focus is moving into one of its
    // suggestion buttons (mouse or keyboard); the button's own handler
    // closes it.
    const next = event.relatedTarget as HTMLElement | null;
    if (next && next.closest(".search-suggestions")) return;
    setSearchFocused(false);
  }

  function clearFilters() {
    posthog.capture(AnalyticsEvent.FiltersCleared);
    setFilters(EMPTY_VENUE_FILTERS);
  }

  function goHome() {
    setViewMode("map");
  }

  function openPlaces() {
    posthog.capture(AnalyticsEvent.PlacesOfWeekViewed);
    setViewMode("places");
    setPhoneView("list");
  }

  const query = serializeVenueFilters(filters);
  const backPath = query ? `/?${query}` : "/";
  const visibleVenues = useMemo(
    () => filterVenues(venues, filters),
    [venues, filters],
  );
  const unknownHours = useMemo(
    () => countUnknownHours(venues, filters),
    [venues, filters],
  );
  const filtersActive = query.length > 0;
  const effectiveSort: PhoneSort =
    sort === "nearest" && !location ? "latest" : sort;
  // The first open venues in the list's own order drive the default camera.
  const fitVenues = useMemo(() => {
    const groups = orderVenues(
      visibleVenues,
      now,
      effectiveSort,
      distanceMap(visibleVenues, location),
    );
    return groups
      .filter((group) => group.key === "open" || group.key === "closing")
      .flatMap((group) => group.items.map((item) => item.venue))
      .slice(0, FIT_VENUE_COUNT);
  }, [visibleVenues, now, effectiveSort, location]);
  const fitKey = `${effectiveSort}|${serializeVenueFilters({ ...filters, query: "" })}|${location ? "loc" : "noloc"}`;

  // A selected venue a filter now hides keeps its ring on the map; only the
  // list and cards follow the filters.
  const mapVenues = useMemo(() => {
    const selected = venues.find((venue) => venue.id === selectedId);
    return selected && !visibleVenues.includes(selected)
      ? [...visibleVenues, selected]
      : visibleVenues;
  }, [venues, selectedId, visibleVenues]);

  const trimmedQuery = filters.query.trim();
  const showSuggestions = searchFocused && trimmedQuery.length > 0;
  // Suggestions are just the already-filtered visible set (name + cuisine
  // match, plus any active chips), capped — so anything shown is a real
  // published venue that stays visible once the query is cleared.
  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    if (!showSuggestions) return [];
    return visibleVenues.slice(0, SEARCH_SUGGESTION_LIMIT).map((venue) => ({
      id: venue.id,
      name: venue.name,
      location: venuePlaceName(venue) ?? "",
    }));
  }, [showSuggestions, visibleVenues]);
  const searchNotFound = showSuggestions && visibleVenues.length === 0;

  useEffect(() => {
    const params = new URLSearchParams(query);
    if (viewMode === "places") params.set("view", "places");
    const combined = params.toString();
    const next = combined ? `/?${combined}` : "/";
    window.history.replaceState(window.history.state, "", next);
  }, [query, viewMode]);

  // Debounced so typing "cha cha" fires one event, not seven — and only
  // the length/result count are sent, never the query text itself.
  useEffect(() => {
    const trimmed = filters.query.trim();
    if (!trimmed) return;
    const timeout = setTimeout(() => {
      posthog.capture(AnalyticsEvent.SearchPerformed, {
        query_length: trimmed.length,
        result_count: visibleVenues.length,
      });
    }, 600);
    return () => clearTimeout(timeout);
  }, [filters.query, visibleVenues.length, posthog]);

  // Keyboard escape hatch: pin selection is otherwise dismissed only by
  // clicking empty map space or the preview close control.
  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  // Warm the detail route before the user commits to it: a hovered row
  // (desktop) or a selected pin/row (any device, right as the preview
  // sheet opens) both predict a "View details" click often enough to be
  // worth the prefetch.
  useEffect(() => {
    const id = hoveredId ?? selectedId;
    if (!id) return;
    const venue = venues.find((candidate) => candidate.id === id);
    if (venue) router.prefetch(`/eat/${venue.slug}`);
  }, [hoveredId, selectedId, venues, router]);

  const sheetBody =
    viewMode === "places" ? (
      <>
        <button
          className="text-link places-back"
          onClick={goHome}
          type="button"
        >
          Back to all places
        </button>
        <PlacesOfTheWeekPanel
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onSelect={selectFromList}
          selectedId={selectedId}
          venues={venues}
        />
      </>
    ) : (
      <ResultsPanel
        filtersActive={filtersActive}
        hoveredId={hoveredId}
        onClearFilters={clearFilters}
        onHover={setHoveredId}
        onPlaces={openPlaces}
        onSelect={selectFromList}
        openNowActive={filters.openNow}
        selectedId={selectedId}
        unknownHours={unknownHours}
        venues={visibleVenues}
      />
    );

  const searchOverlay = (
    <MapSearchOverlay
      active={filtersActive}
      filters={filters}
      notFound={searchNotFound}
      onChange={setFilters}
      onClear={clearFilters}
      onPickSuggestion={selectFromSearch}
      onSearchBlur={handleSearchBlur}
      onSearchFocus={() => setSearchFocused(true)}
      showSuggestions={showSuggestions}
      suggestions={searchSuggestions}
    />
  );

  return (
    <main
      className={isDesktop ? "explorer explorer-desktop" : "explorer explorer-phone"}
    >
      {/* The map-first redesign dropped the visible "Find your next campus
          bite" hero text (map dominates instead), but the page still needs
          exactly one real h1 for accessibility/SEO. */}
      <h1 className="sr-only">TuEats — food around Temple University</h1>
      <SiteHeader
        onHome={goHome}
        onPlaces={openPlaces}
        phoneSlot={isDesktop || phoneView === "list" ? undefined : <PhoneClock />}
        session={session}
        viewMode={viewMode}
      />
      {isDesktop ? (
        // Desktop: persistent list pane beside the map — no sheet.
        <aside aria-label="Places" className="explorer-pane">
          {viewMode === "map" ? searchOverlay : null}
          <div className="explorer-pane-body">{sheetBody}</div>
        </aside>
      ) : null}
      {!isDesktop && phoneView === "list" ? (
        <div className="phone-list-view">
          {viewMode === "places" ? (
            <div className="pl-places">{sheetBody}</div>
          ) : (
            <PhoneListHome
              filters={filters}
              onClearFilters={clearFilters}
              onFiltersChange={setFilters}
              location={location}
              onMap={showPhoneMap}
              onSortChange={setSort}
              sort={effectiveSort}
              onOpenVenue={openPlacePage}
              onPlaces={openPlaces}
              onPrefetchVenue={prefetchPlacePage}
              venues={venues}
              visibleVenues={visibleVenues}
            />
          )}
        </div>
      ) : null}
      {isDesktop || phoneView === "map" ? (
        <div className="explorer-map">
          <VenueMapLoader
            backPath={backPath}
            hoveredId={hoveredId}
            fitKey={fitKey}
            fitVenues={fitVenues}
            initialCamera={cameraMemory.current}
            isSignedIn={session !== null}
            locateSlot={locateSlot}
            onCameraSave={(camera) => {
              cameraMemory.current = camera;
            }}
            userLocation={location}
            onClearSelection={() => setSelectedId(null)}
            onHover={setHoveredId}
            onSelect={selectFromMap}
            onSelectZone={(key) => {
              posthog.capture(AnalyticsEvent.ZoneSelected, { zone: key });
              setFilters((current) => ({
                ...current,
                zones: key ? [key] : [],
              }));
            }}
            phoneLayout={!isDesktop}
            selectedId={selectedId}
            selectedZones={filters.zones}
            venues={mapVenues}
          />
          {isDesktop ? null : (
            <PhoneHome
              backPath={backPath}
              filters={filters}
              locateSlotRef={setLocateSlot}
              onClearFilters={clearFilters}
              onFiltersChange={setFilters}
              onPickSearch={pickFromPhoneSearch}
              onSeeAll={showPhoneList}
              onSelectCard={selectFromList}
              selectedId={selectedId}
              venues={venues}
              visibleVenues={visibleVenues}
            />
          )}
        </div>
      ) : null}
    </main>
  );
}
