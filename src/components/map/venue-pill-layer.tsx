"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
} from "maplibre-gl";

import {
  buildClusterPillIcon,
  buildVenuePillIcon,
  clusterPillIconId,
  venuePillIconId,
  type VenuePillState,
  type VenuePillStatus,
} from "@/lib/map/venue-pill-icon";
import { getPinStatus } from "@/lib/hours";
import { beforeIdFor, liftOverlaysAboveBasemap } from "@/lib/map/overlay-order";
import { CUISINES } from "@/config/cuisines";
import { MAP_ZONES, type MapZoneKey } from "@/config/map-zones";
import type { Venue } from "@/lib/venues";

/** Cluster-card swatch color — the members' shared zone hue, cherry if unzoned. */
function clusterSwatchColor(venue: Venue): string {
  const zone = venue.mapZone as MapZoneKey | null;
  return zone && zone in MAP_ZONES ? MAP_ZONES[zone].color : "#9D2235";
}

const SOURCE_ID = "venue-pills";
export const VENUE_PILL_LAYER_ID = "venue-pills-symbol";

// Screen-pixel radius within which two pills are considered "the same
// spot" and merged into one cluster badge, rather than left to silently
// stack. Comfortably smaller than a minimum-width pill so genuinely
// separate venues (with screen room between them) never merge.
const CLUSTER_RADIUS_PX = 34;

/**
 * With overlap allowed, several pills can share a pixel. MapLibre's own
 * ordering of `queryRenderedFeatures` results isn't a documented contract,
 * so pick the visually topmost hit ourselves using the same `priority`
 * field the layer is sorted by, rather than trusting `features[0]`.
 */
function topFeature(
  features: MapGeoJSONFeature[] | undefined,
): MapGeoJSONFeature | undefined {
  if (!features || features.length === 0) return undefined;
  return features.reduce((top, feature) => {
    const topPriority = (top.properties?.priority as number | undefined) ?? 0;
    const featurePriority =
      (feature.properties?.priority as number | undefined) ?? 0;
    return featurePriority > topPriority ? feature : top;
  });
}

type VenueFeatureProps = {
  kind: "venue";
  id: string;
  priority: number;
  iconId: string;
};

type ClusterFeatureProps = {
  kind: "cluster";
  /** Sorted, comma-joined member venue ids — doubles as the cluster's key. */
  memberIds: string;
  count: number;
  priority: number;
  iconId: string;
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
    };

/**
 * Selected and hovered venues always stand alone (they need a stable
 * anchor for the mini-card / list-hover connection). Everything else gets
 * grouped by on-screen proximity: pills that would land within
 * `CLUSTER_RADIUS_PX` of each other — whether they're at the exact same
 * coordinates or just close enough to visually collide at the current
 * zoom — become one cluster badge instead of silently stacking.
 */
function buildRenderUnits(
  map: MapLibreMap,
  venues: Venue[],
  selectedId: string | null,
  hoveredId: string | null,
  hoveredClusterKey: string | null,
  now: Date,
): RenderUnit[] {
  const standalone: Venue[] = [];
  const clusterable: Venue[] = [];
  for (const venue of venues) {
    if (venue.id === selectedId || venue.id === hoveredId) {
      standalone.push(venue);
    } else {
      clusterable.push(venue);
    }
  }

  const units: RenderUnit[] = standalone.map((venue) => ({
    kind: "venue",
    venue,
    state: pillState(venue, selectedId, hoveredId),
    status: getPinStatus(venue.hours, now),
  }));

  const projected = clusterable.map((venue) => {
    const point = map.project([venue.lng, venue.lat]);
    return { venue, x: point.x, y: point.y };
  });

  // Anchored on each group's FIRST member, not "close to any current
  // member" — a transitive/chained rule lets a dense run of venues (a
  // food court where a dozen pins sit 0-50m apart in a line) merge into
  // one sprawling mega-cluster even though the two ends never visually
  // overlap. Anchoring bounds every group to CLUSTER_RADIUS_PX of one
  // fixed point, so a chain of near-neighbors can't drag distant venues
  // in with it.
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
      const venue = group[0]!.venue;
      units.push({
        kind: "venue",
        venue,
        state: "normal",
        status: getPinStatus(venue.hours, now),
      });
      continue;
    }
    const members = group.map((p) => p.venue);
    const lng = group.reduce((sum, p) => sum + p.venue.lng, 0) / group.length;
    const lat = group.reduce((sum, p) => sum + p.venue.lat, 0) / group.length;
    const state: VenuePillState =
      clusterMemberIds(members) === hoveredClusterKey ? "hover" : "normal";
    units.push({ kind: "cluster", members, anchor: { lng, lat }, state });
  }

  return units;
}

/**
 * Priority tiers, low to high: normal individual pill < cluster badge <
 * hovered individual pill < selected individual pill. Clusters sit above
 * plain pills (they represent more than one venue) but never bury a
 * hovered/selected pill, which — being pulled out of clustering entirely
 * (see `buildRenderUnits`) — always renders as its own pill anyway.
 */
function toFeatureCollection(units: RenderUnit[]) {
  const base = Math.max(units.length, 1);
  return {
    type: "FeatureCollection" as const,
    features: units.map((unit, index) => {
      if (unit.kind === "venue") {
        const { venue, state, status } = unit;
        const priority =
          state === "selected"
            ? base * 3 + index
            : state === "hover"
              ? base * 2 + index
              : index;
        const properties: VenueFeatureProps = {
          kind: "venue",
          id: venue.id,
          priority,
          iconId: venuePillIconId(venue.id, state, venue.name, status),
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
      const { members, anchor, state } = unit;
      const properties: ClusterFeatureProps = {
        kind: "cluster",
        memberIds: clusterMemberIds(members),
        count: members.length,
        priority: base + index,
        iconId: clusterPillIconId(members.length, state),
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

type OpenCluster = { key: string; venues: Venue[]; x: number; y: number };

/**
 * Venue markers as a single native MapLibre symbol layer. Each pill is an
 * opaque sprite with the venue name BAKED IN (venue-pill-icon.ts), one
 * image per venue × state, registered lazily as states are needed —
 * MapLibre paints a layer's icons first and its text-fields second, so a
 * live text-field would bleed a lower pill's name across the pill above
 * it (see Context/decisions.md, zone labels).
 *
 * Overlap is allowed, but pills are no longer left to silently stack:
 * `buildRenderUnits` groups venues whose pills would land on the same
 * screen pixel into a single "N spots" cluster badge (same baked-pill
 * treatment, see `buildClusterPillIcon`) so nothing is ever fully and
 * permanently hidden. Clicking a cluster opens a small list card of its
 * members instead of selecting a venue directly; picking one from that
 * list selects it exactly as tapping its own pill would.
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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer(
      {
        id: VENUE_PILL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "icon-image": ["get", "iconId"],
          "icon-padding": 0,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          // Sprites are drawn at the old z18.5 text size; this reproduces
          // the former text-size zoom ramp, scaling the whole pill about
          // its stem tip.
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            10 / 13,
            15.5,
            11 / 13,
            17,
            12 / 13,
            18.5,
            1,
          ],
          "symbol-sort-key": ["get", "priority"],
        },
      },
      beforeIdFor(map, VENUE_PILL_LAYER_ID),
    );
    liftOverlaysAboveBasemap(map);

    function closePopover() {
      setOpenCluster(null);
    }

    function closePopoverOnOutsideClick(e: {
      point: { x: number; y: number };
    }) {
      if (!map) return;
      const hits = map.queryRenderedFeatures([e.point.x, e.point.y], {
        layers: [VENUE_PILL_LAYER_ID],
      });
      if (hits.length === 0) closePopover();
    }

    map.on("mouseenter", VENUE_PILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", VENUE_PILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
      onHoverRef.current(null);
      setHoveredClusterKey(null);
    });
    map.on("mousemove", VENUE_PILL_LAYER_ID, (e) => {
      const feature = topFeature(e.features as MapGeoJSONFeature[] | undefined);
      if (!feature) return;
      if (feature.properties?.kind === "cluster") {
        onHoverRef.current(null);
        setHoveredClusterKey(String(feature.properties?.memberIds ?? ""));
      } else {
        setHoveredClusterKey(null);
        const id = feature.properties?.id as string | undefined;
        if (id) onHoverRef.current(id);
      }
    });
    map.on("click", VENUE_PILL_LAYER_ID, (e) => {
      const feature = topFeature(e.features as MapGeoJSONFeature[] | undefined);
      if (!feature) return;
      if (feature.properties?.kind === "cluster") {
        const key = String(feature.properties?.memberIds ?? "");
        const ids = key.split(",").filter(Boolean);
        const members = ids
          .map((id) => venuesRef.current.find((venue) => venue.id === id))
          .filter((venue): venue is Venue => Boolean(venue));
        if (members.length === 0) return;
        setOpenCluster((current) =>
          current?.key === key
            ? null
            : { key, venues: members, x: e.point.x, y: e.point.y },
        );
      } else {
        setOpenCluster(null);
        const id = feature.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      }
    });
    map.on("click", closePopoverOnOutsideClick);
    map.on("movestart", closePopover);

    return () => {
      map.off("movestart", closePopover);
      map.off("click", closePopoverOnOutsideClick);
      if (!map.getStyle()) return;
      if (map.getLayer(VENUE_PILL_LAYER_ID))
        map.removeLayer(VENUE_PILL_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
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
      // Register each pill/cluster sprite for the state it is about to
      // render in. Already-built sprites stay cached on the map instance;
      // ids embed the venue name (or spot count), so a rename or a
      // cluster growing/shrinking simply mints a fresh image.
      for (const unit of units) {
        if (unit.kind === "venue") {
          const iconId = venuePillIconId(
            unit.venue.id,
            unit.state,
            unit.venue.name,
            unit.status,
          );
          if (!map.hasImage(iconId)) {
            const asset = buildVenuePillIcon(
              unit.venue.name,
              unit.state,
              unit.status,
            );
            map.addImage(iconId, asset, { pixelRatio: asset.pixelRatio });
          }
        } else {
          const iconId = clusterPillIconId(unit.members.length, unit.state);
          if (!map.hasImage(iconId)) {
            const asset = buildClusterPillIcon(unit.members.length, unit.state);
            map.addImage(iconId, asset, { pixelRatio: asset.pixelRatio });
          }
        }
      }

      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      source.setData(toFeatureCollection(units));

      // A pan/zoom can un-cluster (or re-cluster) venues; if the open
      // popover's exact member set no longer forms a cluster, close it
      // rather than let it point at a badge that's no longer there.
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
