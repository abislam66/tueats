"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
} from "maplibre-gl";

import {
  buildClusterBubbleIcon,
  buildVenueDotIcon,
  buildVenuePillIcon,
  clusterBubbleIconId,
  PLATE_TIP_OFFSET_PX,
  venueDotIconId,
  venuePillIconId,
  type VenuePillState,
  type VenuePillStatus,
} from "@/lib/map/venue-pill-icon";
import {
  ALL_PLATES_MIN_ZOOM,
  MAX_OVERVIEW_PINS,
  pinDensity,
  bestStatus,
  clusterPriority,
  pinPriority,
  showsPlateAtOverview,
} from "@/lib/map/venue-pin-rules";
import { getPinStatus } from "@/lib/hours";
import { useMinuteClock } from "@/lib/use-minute-clock";
import { beforeIdFor, liftOverlaysAboveBasemap } from "@/lib/map/overlay-order";
import {
  DESKTOP_MEDIA_QUERY,
  measureCurrentMobileSheetHeightPx,
} from "@/lib/mobile-sheet-heights";
import { CUISINES } from "@/config/cuisines";
import { MAP_ZONES, type MapZoneKey } from "@/config/map-zones";
import type { Venue } from "@/lib/venues";

/** Cluster-card swatch color — the members' shared zone hue, cherry if unzoned. */
function clusterSwatchColor(venue: Venue): string {
  const zone = venue.mapZone as MapZoneKey | null;
  return zone && zone in MAP_ZONES ? MAP_ZONES[zone].color : "#9D2235";
}

const SOURCE_ID = "venue-pills";
const DOT_SOURCE_ID = "venue-dots";
export const VENUE_PILL_LAYER_ID = "venue-pills-symbol";
export const VENUE_DOT_LAYER_ID = "venue-dots-symbol";
/** Every layer a tap on a venue can land on (plates win over dots). */
export const VENUE_HIT_LAYER_IDS = [
  VENUE_PILL_LAYER_ID,
  VENUE_DOT_LAYER_ID,
] as const;

// Screen-pixel radius within which two plates are considered "the same
// spot" and merged into one count bubble. Collision detection hides any
// other overlap (the loser falls back to its dot), so this only has to
// catch venues that genuinely share a spot.
const CLUSTER_RADIUS_PX = 18;

/**
 * The hit a tap or hover means: a plate/bubble over a dot, then the
 * lowest `priority` (= the one MapLibre placed first). Collision keeps
 * plates from overlapping, but a plate can still sit over another
 * venue's dot.
 */
function topFeature(
  features: MapGeoJSONFeature[] | undefined,
): MapGeoJSONFeature | undefined {
  if (!features || features.length === 0) return undefined;
  const rank = (feature: MapGeoJSONFeature) =>
    (feature.layer.id === VENUE_PILL_LAYER_ID ? 0 : 100) +
    ((feature.properties?.priority as number | undefined) ?? 50);
  return features.reduce((top, feature) =>
    rank(feature) < rank(top) ? feature : top,
  );
}

type VenueFeatureProps = {
  kind: "venue";
  id: string;
  priority: number;
  iconId: string;
  /** Image used below ALL_PLATES_MIN_ZOOM — "" hides the plate there. */
  lowIconId: string;
  anchor: "bottom";
  /** Drops the plate so its stem dot sits exactly on the venue dot. */
  offset: [number, number];
};

type ClusterFeatureProps = {
  kind: "cluster";
  /** Sorted, comma-joined member venue ids — doubles as the cluster's key. */
  memberIds: string;
  count: number;
  priority: number;
  iconId: string;
  lowIconId: string;
  anchor: "center";
  offset: [number, number];
};

function pillState(
  venue: Venue,
  selectedId: string | null,
  hoveredId: string | null,
): VenuePillState {
  if (venue.id === selectedId) return "selected";
  if (venue.id === hoveredId) return "hover";
  return "normal";
}

function clusterMemberIds(members: Venue[]): string {
  return members
    .map((venue) => venue.id)
    .sort()
    .join(",");
}

type RenderUnit =
  | {
      kind: "venue";
      venue: Venue;
      state: VenuePillState;
      status: VenuePillStatus;
    }
  | {
      kind: "cluster";
      members: Venue[];
      anchor: { lng: number; lat: number };
      state: VenuePillState;
      status: VenuePillStatus;
    };

/**
 * Selected and hovered venues always stand alone (they need a stable
 * anchor for the mini-card / list-hover connection). Below
 * ALL_PLATES_MIN_ZOOM, closed / unknown venues are dots only, so they are
 * left out of clustering too. Everything else is grouped by on-screen
 * proximity: plates within `CLUSTER_RADIUS_PX` of a group's first member
 * become one count bubble.
 */
function buildRenderUnits(
  map: MapLibreMap,
  venues: Venue[],
  selectedId: string | null,
  hoveredId: string | null,
  hoveredClusterKey: string | null,
  now: Date,
): RenderUnit[] {
  const density = pinDensity(map.getZoom());
  const lowZoom = density !== "all-plates";
  const bounds = map.getBounds();
  const units: RenderUnit[] = [];
  const clusterable: { venue: Venue; status: VenuePillStatus }[] = [];
  for (const venue of venues) {
    const status = getPinStatus(venue.hours, now);
    const state = pillState(venue, selectedId, hoveredId);
    if (density === "open-only" && state === "normal") {
      // Overview: open venues on screen only; closed ones are hidden.
      if (!showsPlateAtOverview(status, state)) continue;
      if (!bounds.contains([venue.lng, venue.lat])) continue;
    }
    if (
      state !== "normal" ||
      (lowZoom && !showsPlateAtOverview(status, state))
    ) {
      units.push({ kind: "venue", venue, state, status });
    } else {
      clusterable.push({ venue, status });
    }
  }

  const projected = clusterable.map((entry) => {
    const point = map.project([entry.venue.lng, entry.venue.lat]);
    return { ...entry, x: point.x, y: point.y };
  });

  // Anchored on each group's FIRST member, not "close to any current
  // member" — a transitive rule lets a dense run of venues chain into one
  // sprawling cluster even though the two ends never visually overlap.
  const groups: (typeof projected)[] = [];
  for (const point of projected) {
    const target = groups.find((group) => {
      const anchor = group[0]!;
      return (
        Math.hypot(anchor.x - point.x, anchor.y - point.y) <= CLUSTER_RADIUS_PX
      );
    });
    if (target) target.push(point);
    else groups.push([point]);
  }

  for (const group of groups) {
    if (group.length === 1) {
      const { venue, status } = group[0]!;
      units.push({ kind: "venue", venue, state: "normal", status });
      continue;
    }
    const members = group.map((p) => p.venue);
    const lng = group.reduce((sum, p) => sum + p.venue.lng, 0) / group.length;
    const lat = group.reduce((sum, p) => sum + p.venue.lat, 0) / group.length;
    const state: VenuePillState =
      clusterMemberIds(members) === hoveredClusterKey ? "hover" : "normal";
    units.push({
      kind: "cluster",
      members,
      anchor: { lng, lat },
      state,
      status: bestStatus(group.map((p) => p.status)),
    });
  }

  if (density === "open-only") return capOverviewUnits(units);
  return units;
}

/** Overview keeps the 12 best pins (selected, hovered, open first). */
function capOverviewUnits(units: RenderUnit[]): RenderUnit[] {
  if (units.length <= MAX_OVERVIEW_PINS) return units;
  const rank = (unit: RenderUnit) =>
    unit.kind === "venue"
      ? pinPriority(unit.status, unit.state)
      : clusterPriority(unit.status);
  return [...units]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_OVERVIEW_PINS);
}

function unitIconId(unit: RenderUnit): string {
  return unit.kind === "venue"
    ? venuePillIconId(unit.venue.id, unit.state, unit.venue.name, unit.status)
    : clusterBubbleIconId(unit.members.length, unit.status, unit.state);
}

/**
 * Plate/bubble features. `priority` feeds `symbol-sort-key`; with
 * collision on, MapLibre places LOWER keys first and they win (see
 * venue-pin-rules.ts): selected > hovered > open > closing > closed.
 */
function toFeatureCollection(units: RenderUnit[]) {
  return {
    type: "FeatureCollection" as const,
    features: units.map((unit) => {
      const iconId = unitIconId(unit);
      if (unit.kind === "venue") {
        const { venue, state, status } = unit;
        const properties: VenueFeatureProps = {
          kind: "venue",
          id: venue.id,
          priority: pinPriority(status, state),
          iconId,
          lowIconId: showsPlateAtOverview(status, state) ? iconId : "",
          anchor: "bottom",
          offset: [0, PLATE_TIP_OFFSET_PX],
        };
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [venue.lng, venue.lat],
          },
          properties,
        };
      }
      const { members, anchor, status } = unit;
      const properties: ClusterFeatureProps = {
        kind: "cluster",
        memberIds: clusterMemberIds(members),
        count: members.length,
        priority: clusterPriority(status),
        iconId,
        lowIconId: iconId,
        anchor: "center",
        offset: [0, 0],
      };
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [anchor.lng, anchor.lat],
        },
        properties,
      };
    }),
  };
}

/** One dot per venue at its true coordinate — always shown, never collides. */
function toDotCollection(venues: Venue[], now: Date) {
  return {
    type: "FeatureCollection" as const,
    features: venues.map((venue) => {
      const status = getPinStatus(venue.hours, now);
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [venue.lng, venue.lat],
        },
        properties: {
          kind: "venue" as const,
          id: venue.id,
          priority: pinPriority(status, "normal"),
          status,
          iconId: venueDotIconId(status),
        },
      };
    }),
  };
}

type OpenCluster = { key: string; venues: Venue[]; x: number; y: number };

/**
 * Venue markers as two native MapLibre symbol layers:
 *
 * - a dot layer — one 6px status dot per venue at its true coordinate,
 *   always drawn (overlap allowed, placement ignored);
 * - a plate layer — baked name plates and cluster count bubbles with
 *   collision detection ON, so plates never overlap each other. Losers
 *   simply aren't placed and their dot shows through. `symbol-sort-key`
 *   decides who wins (selected > hovered > open > closing > closed).
 *
 * Below ALL_PLATES_MIN_ZOOM the plate layer's `icon-image` switches to
 * `lowIconId`, which is empty for closed / unknown venues, so they read as
 * dots at overview and become full plates from z16.
 *
 * Names stay baked into sprites (venue-pill-icon.ts): MapLibre paints a
 * layer's icons before its text-fields, so live text would bleed across a
 * neighbouring plate (see Context/decisions.md, zone labels).
 *
 * Tapping a count bubble zooms in until its venues separate; when they
 * share a spot (no zoom would split them) it opens the members list card
 * instead, and picking a row selects that venue.
 */
export function VenuePillLayer({
  map,
  venues,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  map: MapLibreMap | null;
  venues: Venue[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (venueId: string) => void;
  onHover: (venueId: string | null) => void;
}) {
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const venuesRef = useRef(venues);
  const clusterAnchorRef = useRef<HTMLDivElement | null>(null);
  const [hoveredClusterKey, setHoveredClusterKey] = useState<string | null>(
    null,
  );
  const [openCluster, setOpenCluster] = useState<OpenCluster | null>(null);
  // Re-evaluate pin status every minute so "closing soon" stays live.
  const now = useMinuteClock();

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    venuesRef.current = venues;
  }, [venues]);

  // A new venue set (zone switch, filter change) invalidates whatever
  // cluster was open — its members may no longer even be in view.
  useEffect(() => {
    setOpenCluster(null);
  }, [venues]);

  useEffect(() => {
    if (!openCluster) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenCluster(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openCluster]);

  useEffect(() => {
    if (!map || map.getSource(SOURCE_ID)) return;

    // `map` is only ever handed down after the parent's own one-time "load"
    // event already fired (see VenueMap), so the style is guaranteed ready
    // here — no gating on isStyleLoaded()/"load" needed (see venue-map.tsx
    // history: that gate silently dead-ends for late-mounted layers).
    const empty = { type: "FeatureCollection" as const, features: [] };
    map.addSource(DOT_SOURCE_ID, { type: "geojson", data: empty });
    map.addSource(SOURCE_ID, { type: "geojson", data: empty });

    map.addLayer(
      {
        id: VENUE_DOT_LAYER_ID,
        type: "symbol",
        source: DOT_SOURCE_ID,
        layout: {
          "icon-image": ["get", "iconId"],
          "icon-anchor": "center",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["get", "priority"],
        },
      },
      beforeIdFor(map, VENUE_DOT_LAYER_ID),
    );

    map.addLayer(
      {
        id: VENUE_PILL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "icon-image": [
            "step",
            ["zoom"],
            ["get", "lowIconId"],
            ALL_PLATES_MIN_ZOOM,
            ["get", "iconId"],
          ],
          // Sprites already carry a transparent margin around the plate,
          // so collision boxes keep a few px between neighbours.
          "icon-padding": 0,
          "icon-anchor": ["get", "anchor"],
          "icon-offset": ["get", "offset"],
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "symbol-sort-key": ["get", "priority"],
        },
      },
      beforeIdFor(map, VENUE_PILL_LAYER_ID),
    );
    liftOverlaysAboveBasemap(map);

    function hitAt(point: { x: number; y: number }) {
      if (!map) return undefined;
      const layers = VENUE_HIT_LAYER_IDS.filter((id) => map.getLayer(id));
      if (layers.length === 0) return undefined;
      return topFeature(
        map.queryRenderedFeatures([point.x, point.y], { layers: [...layers] }),
      );
    }

    function membersOf(key: string): Venue[] {
      return key
        .split(",")
        .filter(Boolean)
        .map((id) => venuesRef.current.find((venue) => venue.id === id))
        .filter((venue): venue is Venue => Boolean(venue));
    }

    /** Zoom until the members separate; list them if they never would. */
    function expandCluster(key: string, point: { x: number; y: number }) {
      if (!map) return;
      const members = membersOf(key);
      if (members.length === 0) return;
      const west = Math.min(...members.map((v) => v.lng));
      const east = Math.max(...members.map((v) => v.lng));
      const south = Math.min(...members.map((v) => v.lat));
      const north = Math.max(...members.map((v) => v.lat));
      const a = map.project([west, south]);
      const b = map.project([east, north]);
      const spreadAtMax =
        Math.hypot(a.x - b.x, a.y - b.y) *
        2 ** (map.getMaxZoom() - map.getZoom());
      if (
        spreadAtMax <= CLUSTER_RADIUS_PX ||
        map.getZoom() >= map.getMaxZoom() - 0.1
      ) {
        setOpenCluster((current) =>
          current?.key === key
            ? null
            : { key, venues: members, x: point.x, y: point.y },
        );
        return;
      }
      setOpenCluster(null);
      const desktop = window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const pad = 72;
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: {
            top: pad,
            right: pad,
            left: pad,
            bottom: pad + (desktop ? 0 : measureCurrentMobileSheetHeightPx()),
          },
          maxZoom: map.getMaxZoom(),
          duration: reduce ? 0 : 450,
        },
      );
    }

    let hovering: string | null = null;
    function onMouseMove(e: { point: { x: number; y: number } }) {
      if (!map) return;
      const feature = hitAt(e.point);
      const next = !feature
        ? null
        : feature.properties?.kind === "cluster"
          ? `cluster:${String(feature.properties?.memberIds ?? "")}`
          : `venue:${String(feature.properties?.id ?? "")}`;
      if (next === hovering) return;
      hovering = next;
      map.getCanvas().style.cursor = next ? "pointer" : "";
      if (next?.startsWith("cluster:")) {
        onHoverRef.current(null);
        setHoveredClusterKey(next.slice("cluster:".length));
      } else {
        setHoveredClusterKey(null);
        onHoverRef.current(next ? next.slice("venue:".length) : null);
      }
    }

    function onMouseOut() {
      if (!map || hovering === null) return;
      hovering = null;
      map.getCanvas().style.cursor = "";
      onHoverRef.current(null);
      setHoveredClusterKey(null);
    }

    function onClick(e: { point: { x: number; y: number } }) {
      const feature = hitAt(e.point);
      if (!feature) {
        setOpenCluster(null);
        return;
      }
      if (feature.properties?.kind === "cluster") {
        expandCluster(String(feature.properties?.memberIds ?? ""), e.point);
        return;
      }
      setOpenCluster(null);
      const id = feature.properties?.id as string | undefined;
      if (id) onSelectRef.current(id);
    }

    function closePopover() {
      setOpenCluster(null);
    }

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseOut);
    map.on("click", onClick);
    map.on("movestart", closePopover);

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseOut);
      map.off("click", onClick);
      map.off("movestart", closePopover);
      if (!map.getStyle()) return;
      for (const id of [VENUE_PILL_LAYER_ID, VENUE_DOT_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of [SOURCE_ID, DOT_SOURCE_ID]) {
        if (map.getSource(id)) map.removeSource(id);
      }
    };
  }, [map]);

  useEffect(() => {
    if (!map || !map.getSource(SOURCE_ID)) return;

    function rebuild() {
      if (!map) return;
      const units = buildRenderUnits(
        map,
        venues,
        selectedId,
        hoveredId,
        hoveredClusterKey,
        now,
      );
      // Register each sprite for the state it is about to render in.
      // Already-built sprites stay cached on the map instance; ids embed
      // the venue name (or count + status), so a rename or a cluster
      // growing/shrinking simply mints a fresh image.
      for (const unit of units) {
        const iconId = unitIconId(unit);
        if (map.hasImage(iconId)) continue;
        const asset =
          unit.kind === "venue"
            ? buildVenuePillIcon(unit.venue.name, unit.state, unit.status)
            : buildClusterBubbleIcon(
                unit.members.length,
                unit.status,
                unit.state,
              );
        map.addImage(iconId, asset, { pixelRatio: asset.pixelRatio });
      }

      // Overview (zoom < 15) shows only the pins that survived the cap, so
      // dots follow the units instead of every venue.
      const dotVenues =
        pinDensity(map.getZoom()) === "open-only"
          ? units.flatMap((unit) =>
              unit.kind === "venue" ? [unit.venue] : unit.members,
            )
          : venues;
      const dots = toDotCollection(dotVenues, now);
      for (const feature of dots.features) {
        const { iconId, status } = feature.properties;
        if (map.hasImage(iconId)) continue;
        const asset = buildVenueDotIcon(status);
        map.addImage(iconId, asset, { pixelRatio: asset.pixelRatio });
      }

      (map.getSource(DOT_SOURCE_ID) as GeoJSONSource).setData(dots);
      (map.getSource(SOURCE_ID) as GeoJSONSource).setData(
        toFeatureCollection(units),
      );

      // A pan/zoom can un-cluster (or re-cluster) venues; if the open
      // popover's exact member set no longer forms a cluster, close it
      // rather than let it point at a bubble that's no longer there.
      setOpenCluster((current) => {
        if (!current) return current;
        const stillClustered = units.some(
          (unit) =>
            unit.kind === "cluster" &&
            clusterMemberIds(unit.members) === current.key,
        );
        return stillClustered ? current : null;
      });
    }

    rebuild();
    map.on("moveend", rebuild);
    map.on("resize", rebuild);
    return () => {
      map.off("moveend", rebuild);
      map.off("resize", rebuild);
    };
  }, [map, venues, selectedId, hoveredId, hoveredClusterKey, now]);

  useLayoutEffect(() => {
    if (!map || !openCluster) return;
    const node = clusterAnchorRef.current;
    if (!node) return;
    const margin = 8;
    const half = node.offsetWidth / 2;
    const mapWidth = map.getContainer().clientWidth;
    const x = Math.min(
      Math.max(openCluster.x, half + margin),
      mapWidth - half - margin,
    );
    node.style.left = `${x}px`;
    node.style.top = `${openCluster.y}px`;
    node.classList.toggle(
      "map-cluster-card-anchor-below",
      openCluster.y - node.offsetHeight - 16 < margin,
    );
  }, [map, openCluster]);

  if (!openCluster) return null;

  return (
    <div className="map-cluster-card-anchor" ref={clusterAnchorRef}>
      <div className="map-cluster-card">
        <div className="map-cluster-card-header">
          <span>{openCluster.venues.length} SPOTS HERE!</span>
          <button
            aria-label="Close"
            className="map-cluster-card-close"
            onClick={() => setOpenCluster(null)}
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
        <ul className="map-cluster-card-list">
          {openCluster.venues.map((venue) => (
            <li key={venue.id}>
              <button
                className="map-cluster-card-row"
                onClick={() => {
                  setOpenCluster(null);
                  onSelectRef.current(venue.id);
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="map-cluster-card-swatch"
                  style={{ background: clusterSwatchColor(venue) }}
                />
                <span className="map-cluster-card-row-text">
                  <span className="map-cluster-card-row-name">
                    {venue.name}
                  </span>
                  {venue.cuisines[0] ? (
                    <span className="map-cluster-card-row-cuisine">
                      {CUISINES[venue.cuisines[0]].label}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
