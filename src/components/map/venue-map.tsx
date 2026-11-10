"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { CampusBuildingLayer } from "@/components/map/campus-building-layer";
import { CampusDiningLayer } from "@/components/map/campus-dining-layer";
import { LocateControl } from "@/components/map/locate-control";
import { MemberLocate } from "@/components/map/member-locate";
import { MapAttribution } from "@/components/map/map-attribution";
import {
  MAP_ZONE_CLICK_LAYER_IDS,
  MapZoneLayer,
} from "@/components/map/map-zone-layer";
import {
  VenuePillLayer,
  VENUE_PILL_LAYER_ID,
} from "@/components/map/venue-pill-layer";
import { OpenStatus } from "@/components/venues/venue-bits";
import {
  MAP_ZONE_KEYS,
  MAP_ZONES,
  MAP_ZONE_OVERVIEW_MAX_ZOOM,
  mapZoneBounds,
  type MapZoneKey,
} from "@/config/map-zones";
import {
  CAMPUS_BOUNDS,
  CAMPUS_MAX_BOUNDS,
  DEFAULT_VIEWPORT,
  MAP_STYLE_URL,
} from "@/config/site";
import { formatCampusNow, formatClockTime, getOpenStatus } from "@/lib/hours";
import { useMinuteClock } from "@/lib/use-minute-clock";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import { venuePlainLine } from "@/lib/venue-groups";
import { mapZoneContaining } from "@/lib/map/point-in-polygon";
import {
  DESKTOP_MEDIA_QUERY,
  measureCurrentMobileSheetHeightPx,
  measureMobileSheetHeightPx,
} from "@/lib/mobile-sheet-heights";
import type { Venue } from "@/lib/venues";

import "maplibre-gl/dist/maplibre-gl.css";

// Screen-px gap between the pin coordinate (the stem-dot tip) and the
// mini-card bottom: the ~61px-tall plate plus breathing room. Keep in
// sync with the .map-mini-card-anchor transform in globals.css.
const MINI_CARD_PIN_CLEARANCE = 68;

// Zoom a selection flies to when its venue has no host zone (zone flights
// have their own fitBounds). Street level, where pills read individually.
const VENUE_STREET_ZOOM = 16;

/** Live campus time so the status sort reads as "right now". */
function MapClock() {
  const now = useMinuteClock();
  return (
    <time className="tabular" suppressHydrationWarning>
      {formatCampusNow(now)}
    </time>
  );
}

/** "Open until 4:00 AM" in open green; other states fall back to the badge. */
function MiniCardStatus({ venue }: { venue: Venue }) {
  const now = useMinuteClock();
  const status =
    venue.status === "published" ? getOpenStatus(venue.hours, now) : null;
  if (status?.kind === "open") {
    return (
      <p className="map-mini-card-status">
        Open until{" "}
        <time className="tabular">{formatClockTime(status.closesAt)}</time>
      </p>
    );
  }
  return (
    <p className="map-mini-card-status is-muted">
      <OpenStatus venue={venue} />
    </p>
  );
}

export function VenueMap({
  venues,
  selectedId,
  hoveredId,
  backPath,
  selectedZones,
  isSignedIn,
  onSelect,
  onHover,
  onClearSelection,
  onSelectZone,
}: {
  venues: Venue[];
  selectedId: string | null;
  hoveredId: string | null;
  backPath: string;
  /** Zone filter selection — any number of zones can be active at once. */
  selectedZones: MapZoneKey[];
  /** Signed-in members get a one-shot "locate me" on first map load. */
  isSignedIn: boolean;
  onSelect: (venueId: string) => void;
  onHover: (venueId: string | null) => void;
  onClearSelection: () => void;
  onSelectZone: (key: MapZoneKey | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const miniCardAnchorRef = useRef<HTMLDivElement | null>(null);
  const onClearSelectionRef = useRef(onClearSelection);
  const onSelectZoneRef = useRef(onSelectZone);
  const enteringZoneRef = useRef(false);
  const selectedZonesRef = useRef<MapZoneKey[]>(selectedZones);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The mini-card stages behind the camera: it mounts only once the map
  // has arrived at the selection (zone fly-in / street zoom complete).
  const [poppedVenueId, setPoppedVenueId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const selectedVenue = venues.find((venue) => venue.id === selectedId) ?? null;
  const zonesActive = selectedZones.length > 0;
  const poppedVenue =
    selectedVenue && poppedVenueId === selectedVenue.id ? selectedVenue : null;

  // Live "SPOTS" counts baked into each zone badge (retro-HUD redesign) —
  // recomputed whenever the filtered venue set changes, not just on mount.
  const zoneCounts = useMemo(() => {
    const counts = Object.fromEntries(
      MAP_ZONE_KEYS.map((key) => [key, 0]),
    ) as Record<MapZoneKey, number>;
    for (const venue of venues) {
      const key = mapZoneContaining(venue.lng, venue.lat);
      if (key) counts[key] += 1;
    }
    return counts;
  }, [venues]);

  // Live zoom — drives when pins take over from zone badges.
  const [hudZoom, setHudZoom] = useState<number | null>(null);

  // Individual pins take over from zone badges once the user has zoomed in
  // past overview scale on their own — not only when a zone is explicitly
  // clicked. Reuses the same threshold the zoom-out-to-exit effect below
  // uses, so crossing it means the same thing in both directions.
  const zoomedPastOverview =
    hudZoom !== null && hudZoom >= MAP_ZONE_OVERVIEW_MAX_ZOOM;
  const pinsVisible = zonesActive || zoomedPastOverview;
  // Pills render whenever pins are visible (venues are already filtered to
  // any active zone selection); a selected venue outside every zone still
  // gets its own pill so the mini-card never floats bare.
  const pinVenues = pinsVisible ? venues : selectedVenue ? [selectedVenue] : [];
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
    function sync() {
      setIsDesktop(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!map) return;
    // MapLibre fires "move"/"zoom" on every animation frame during a pan,
    // zoom, or fly-to — updating this text readout that often means a
    // React re-render on every single frame, competing with MapLibre's
    // own WebGL repaint for the same frame budget. A coordinate readout
    // updating every ~100ms instead of every ~16ms reads identically to
    // the eye, so the live handler is throttled; moveend/zoomend still
    // sync unthrottled so the settled position is always exact.
    let lastUpdate = 0;
    const HUD_THROTTLE_MS = 100;
    function syncHud() {
      if (!map) return;
      setHudZoom(map.getZoom());
    }
    function throttledSyncHud() {
      const now = performance.now();
      if (now - lastUpdate < HUD_THROTTLE_MS) return;
      lastUpdate = now;
      syncHud();
    }
    syncHud();
    map.on("move", throttledSyncHud);
    map.on("zoom", throttledSyncHud);
    map.on("moveend", syncHud);
    map.on("zoomend", syncHud);
    return () => {
      map.off("move", throttledSyncHud);
      map.off("zoom", throttledSyncHud);
      map.off("moveend", syncHud);
      map.off("zoomend", syncHud);
    };
  }, [map]);

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection]);

  useEffect(() => {
    onSelectZoneRef.current = onSelectZone;
  }, [onSelectZone]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let disposed = false;

    async function init() {
      const maplibre = await import("maplibre-gl");
      if (disposed || !containerRef.current) return;

      const instance = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: DEFAULT_VIEWPORT.center,
        zoom: DEFAULT_VIEWPORT.zoom,
        maxBounds: CAMPUS_MAX_BOUNDS,
        minZoom: 13.5,
        maxZoom: 18.5,
        attributionControl: false,
        logoPosition: "bottom-left",
        pitchWithRotate: false,
        dragRotate: false,
      });

      mapRef.current = instance;

      instance.fitBounds(
        [
          [CAMPUS_BOUNDS.west, CAMPUS_BOUNDS.south],
          [CAMPUS_BOUNDS.east, CAMPUS_BOUNDS.north],
        ],
        {
          padding: 48,
          duration: 0,
          maxZoom: DEFAULT_VIEWPORT.zoom,
        },
      );

      instance.once("load", () => {
        if (disposed) return;
        setMap(instance);
        setReady(true);
      });

      instance.on("error", () => {
        if (!disposed) setFailed(true);
      });

      instance.on("click", (e) => {
        if (instance.getLayer(VENUE_PILL_LAYER_ID)) {
          const hits = instance.queryRenderedFeatures(e.point, {
            layers: [VENUE_PILL_LAYER_ID],
          });
          if (hits.length > 0) return;
        }
        const zoneLayers = MAP_ZONE_CLICK_LAYER_IDS.filter((id) =>
          instance.getLayer(id),
        );
        if (zoneLayers.length > 0) {
          const zoneHits = instance.queryRenderedFeatures(e.point, {
            layers: [...zoneLayers],
          });
          if (zoneHits.length > 0) return;
        }
        onClearSelectionRef.current();
      });
    }

    // The MapLibre constructor throws synchronously when WebGL is
    // unavailable (old devices, disabled GPU) — without the catch, the UI
    // hangs on "Loading campus map…" forever instead of falling back.
    init().catch(() => {
      if (!disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const resize = () => map.resize();
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [map]);

  useEffect(() => {
    if (!map || !selectedVenue) return;
    const hostZone = mapZoneContaining(selectedVenue.lng, selectedVenue.lat);
    if (hostZone && !selectedZonesRef.current.includes(hostZone)) {
      onSelectZoneRef.current(hostZone);
      return;
    }
    // No host zone to fly into: go to the truck itself — center it and
    // come down to street zoom if the map is still zoomed out.
    const position: [number, number] = [selectedVenue.lng, selectedVenue.lat];
    const desktop = window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
    if (
      desktop &&
      map.getBounds().contains(position) &&
      map.getZoom() >= VENUE_STREET_ZOOM
    ) {
      return;
    }
    // The results sheet now overlays the bottom of the map at every
    // breakpoint. On mobile, selecting a venue swaps the sheet into
    // preview mode, so pad for that height directly (avoids a race with
    // MobileSheet's own effect updating the live [data-sheet] attribute).
    // On desktop the mini-card handles the selection instead — the sheet
    // stays in whatever browse state it was in — so pad for its actual
    // current height, not preview's.
    map.easeTo({
      center: position,
      zoom: Math.max(map.getZoom(), VENUE_STREET_ZOOM),
      padding: {
        top: 0,
        right: 0,
        // Desktop has no sheet over the map (list is a side pane).
        bottom: desktop ? 0 : measureMobileSheetHeightPx("preview"),
        left: 0,
      },
      duration: reduceMotion ? 0 : 650,
    });
  }, [map, selectedVenue, reduceMotion]);

  // The mini-card tracks the selected pin: its anchor's left/top are
  // written directly (no re-render) from the pin's projected screen point
  // on every map move.
  useEffect(() => {
    if (!map || !poppedVenue) return;
    const position: [number, number] = [poppedVenue.lng, poppedVenue.lat];
    function place() {
      const node = miniCardAnchorRef.current;
      if (!node || !map) return;
      const point = map.project(position);
      const margin = 8;
      const half = node.offsetWidth / 2;
      const mapWidth = map.getContainer().clientWidth;
      // Clamp horizontally so a pin near the map edge doesn't clip the card.
      const x = Math.min(
        Math.max(point.x, half + margin),
        mapWidth - half - margin,
      );
      node.style.left = `${x}px`;
      node.style.top = `${point.y}px`;
      // Near the top edge there's no room above the pill — open below it.
      node.classList.toggle(
        "map-mini-card-anchor-below",
        point.y - node.offsetHeight - MINI_CARD_PIN_CLEARANCE < margin,
      );
    }
    place();
    map.on("move", place);
    map.on("resize", place);
    return () => {
      map.off("move", place);
      map.off("resize", place);
    };
  }, [map, poppedVenue]);

  // AnimatePresence keeps the outgoing card mounted through its exit fade,
  // and that late unmount detaches the ref (null) AFTER the entering card
  // attached it — only ever overwrite with a real node.
  function setMiniCardAnchor(node: HTMLDivElement | null) {
    if (node) miniCardAnchorRef.current = node;
  }

  useEffect(() => {
    selectedZonesRef.current = selectedZones;
  }, [selectedZones]);

  useEffect(() => {
    if (!map || selectedZones.length === 0) return;
    flyToZones(
      map,
      selectedZones,
      reduceMotion,
      enteringZoneRef,
      Boolean(selectedId),
    );
  }, [map, selectedZones, reduceMotion, selectedId]);

  // Stage the mini-card behind the camera: zone flight first, then the
  // pop. Declared AFTER the camera effects above so a movement they just
  // started is already observable via isMoving(); while the host zone is
  // still being selected (prop not yet caught up) this bails and re-runs
  // when the zone lands. No movement at all → pop immediately.
  useEffect(() => {
    if (!map || !selectedVenue) {
      setPoppedVenueId(null);
      return;
    }
    const hostZone = mapZoneContaining(selectedVenue.lng, selectedVenue.lat);
    if (hostZone && !selectedZones.includes(hostZone)) return;
    if (map.isMoving()) {
      const pop = () => setPoppedVenueId(selectedVenue.id);
      map.once("moveend", pop);
      return () => {
        map.off("moveend", pop);
      };
    }
    setPoppedVenueId(selectedVenue.id);
  }, [map, selectedVenue, selectedZones]);

  useEffect(() => {
    if (!map) return;
    function onZoomEnd() {
      if (enteringZoneRef.current) return;
      // Zoom-out-to-exit applies only to a single zone: a multi-zone fit
      // legitimately lands below the overview threshold, and clearing it
      // there would wipe the user's filter selection mid-look.
      if (
        selectedZonesRef.current.length === 1 &&
        map &&
        map.getZoom() < MAP_ZONE_OVERVIEW_MAX_ZOOM
      ) {
        onSelectZoneRef.current(null);
        onClearSelectionRef.current();
      }
    }
    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [map]);

  function zoomBy(delta: number) {
    if (!map) return;
    map.easeTo({
      zoom: map.getZoom() + delta,
      duration: reduceMotion ? 0 : 220,
    });
  }

  function resetView() {
    if (!map) return;
    onSelectZone(null);
    onClearSelection();
    map.fitBounds(
      [
        [CAMPUS_BOUNDS.west, CAMPUS_BOUNDS.south],
        [CAMPUS_BOUNDS.east, CAMPUS_BOUNDS.north],
      ],
      {
        padding: 48,
        duration: reduceMotion ? 0 : 450,
        maxZoom: DEFAULT_VIEWPORT.zoom,
      },
    );
  }

  function selectZone(key: MapZoneKey) {
    onSelectZone(key);
  }

  function closeMiniCard() {
    onClearSelection();
    // The close button unmounts with the card — hand focus back to the
    // map canvas so keyboard users aren't dropped at the document root.
    mapRef.current?.getCanvas().focus();
  }

  return (
    <div
      className="venue-map"
      aria-label="Temple campus food map"
      aria-describedby="venue-map-usage"
      role="region"
    >
      <p className="sr-only" id="venue-map-usage">
        Interactive map of food venues around Temple University&apos;s main
        campus. At campus zoom, tap a named zone to fly in and see the trucks
        there. Use All zones or pinch/zoom out to return to the campus overview.
        Focus the map, then pan with the arrow keys and zoom with the plus and
        minus keys. Every venue on the map is also in the venue list.
      </p>
      <p aria-live="polite" className="sr-only">
        {selectedVenue
          ? `${selectedVenue.name}. ${getOpenStatus(selectedVenue.hours).label}.`
          : ""}
      </p>
      <div className="venue-map-canvas" ref={containerRef} />

      {!ready && !failed ? (
        <div className="venue-map-loading" aria-live="polite">
          Loading campus map…
        </div>
      ) : null}

      {failed ? (
        <div className="venue-map-fallback" role="status">
          <p>Map tiles unavailable.</p>
          <p>Browse the list — campus pins will return when the map loads.</p>
        </div>
      ) : null}

      <div className="map-controls">
        <button
          aria-label="Zoom in"
          className="map-control-button map-control-zoom"
          disabled={!ready}
          onClick={() => zoomBy(0.75)}
          type="button"
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className="map-control-button map-control-zoom"
          disabled={!ready}
          onClick={() => zoomBy(-0.75)}
          type="button"
        >
          −
        </button>
        <button
          aria-label="Reset view to campus"
          className="map-control-button"
          disabled={!ready}
          onClick={resetView}
          title="Reset view to campus"
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
            viewBox="0 0 16 16"
            width="16"
          >
            <path d="M2 5V3a1 1 0 0 1 1-1h2" />
            <path d="M11 2h2a1 1 0 0 1 1 1v2" />
            <path d="M14 11v2a1 1 0 0 1-1 1h-2" />
            <path d="M5 14H3a1 1 0 0 1-1-1v-2" />
          </svg>
        </button>
        <LocateControl map={map} />
      </div>

      <MemberLocate enabled={isSignedIn} map={map} />

      {zonesActive ? (
        <p className="map-zone-label">
          {selectedZones.length === 1
            ? MAP_ZONES[selectedZones[0]!].label
            : `${selectedZones.length} zones`}
        </p>
      ) : null}

      <ul aria-label="Pin colors" className="map-legend">
        <li className="map-legend-clock">
          <MapClock />
        </li>
        <li>
          <span aria-hidden="true" className="map-legend-swatch is-open" />
          Open
        </li>
        <li>
          <span aria-hidden="true" className="map-legend-swatch is-closing" />
          Closing soon
        </li>
        <li>
          <span aria-hidden="true" className="map-legend-swatch is-closed" />
          Closed
        </li>
      </ul>

      <MapAttribution />

      <CampusBuildingLayer map={map} />

      <MapZoneLayer
        map={map}
        onSelect={selectZone}
        zoneCounts={zoneCounts}
        zonesActive={pinsVisible}
      />

      {/* Overlay stack (overlay-order.ts) paints above Positron, so road
          names never cover buildings, zones, or pins. Dining mounts before
          VenuePillLayer so venue pills stay on top of info pins. */}
      <CampusDiningLayer map={map} visible={!pinsVisible} />

      <VenuePillLayer
        hoveredId={hoveredId}
        map={map}
        onHover={onHover}
        onSelect={onSelect}
        selectedId={selectedId}
        venues={pinVenues}
      />

      <AnimatePresence>
        {poppedVenue && isDesktop ? (
          // Outer div: positioned at the pin by the placement effect (its
          // CSS transform centers the card above the pill) — framer must
          // not own its transform, so only opacity animates here. Inner
          // div carries the y-slide.
          <motion.div
            animate={{ opacity: 1 }}
            className="map-mini-card-anchor"
            exit={{ opacity: 0 }}
            initial={reduceMotion ? false : { opacity: 0 }}
            key={poppedVenue.id}
            ref={setMiniCardAnchor}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <motion.div
              animate={{ y: 0 }}
              className="map-mini-card-wrap"
              exit={{ y: 8 }}
              initial={reduceMotion ? false : { y: 12 }}
              transition={{
                duration: reduceMotion ? 0 : 0.2,
                ease: "easeOut",
              }}
            >
              <div className="map-mini-card">
                <h3 className="map-mini-card-name">{poppedVenue.name}</h3>
                {venuePlainLine(poppedVenue) ? (
                  <p className="map-mini-card-line">
                    {venuePlainLine(poppedVenue)}
                  </p>
                ) : null}
                <MiniCardStatus venue={poppedVenue} />
                <div className="venue-actions">
                  <a
                    className="button button-primary"
                    href={googleMapsDirectionsUrl(poppedVenue)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Get directions
                  </a>
                  <Link
                    className="button button-secondary"
                    href={`/eat/${poppedVenue.slug}?from=${encodeURIComponent(backPath)}`}
                  >
                    View details
                  </Link>
                </div>
                <button
                  aria-label="Close venue preview"
                  className="map-mini-card-close"
                  onClick={closeMiniCard}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="14"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                    viewBox="0 0 16 16"
                    width="14"
                  >
                    <path d="m4 4 8 8" />
                    <path d="m12 4-8 8" />
                  </svg>
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function flyToZones(
  map: MapLibreMap,
  keys: MapZoneKey[],
  reduceMotion: boolean | null,
  enteringZoneRef: { current: boolean },
  venueSelected: boolean,
) {
  enteringZoneRef.current = true;
  // Union of every selected zone's bbox — one zone behaves exactly as the
  // old single-zone flight.
  const boxes = keys.map((key) => mapZoneBounds(key));
  const bounds = {
    west: Math.min(...boxes.map((b) => b.west)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    north: Math.max(...boxes.map((b) => b.north)),
  };
  const pad = Math.max(...keys.map((key) => MAP_ZONES[key].padding));
  // The sheet overlays the map at every breakpoint now. Only mobile ever
  // swaps into preview mode on a venue selection (desktop's mini-card
  // handles that instead, leaving the sheet in its current browse state)
  // — so "preview" height only applies there; every other case pads for
  // whatever height the sheet is actually showing right now.
  const isMobile = !window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  const bottomInset = !isMobile
    ? 0
    : venueSelected
      ? measureMobileSheetHeightPx("preview")
      : measureCurrentMobileSheetHeightPx();
  map.fitBounds(
    [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    ],
    {
      padding: {
        top: pad,
        right: pad,
        bottom: pad + bottomInset,
        left: pad,
      },
      duration: reduceMotion ? 0 : 450,
      maxZoom: 17.4,
    },
  );
  map.once("moveend", () => {
    enteringZoneRef.current = false;
  });
}
