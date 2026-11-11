"use client";

import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { CAMPUS_DINING_MARKERS } from "@/config/campus-dining";
import { beforeIdFor, liftOverlaysAboveBasemap } from "@/lib/map/overlay-order";
import { currentTheme } from "@/lib/theme";
import {
  buildDiningPillIcon,
  DINING_PILL_ICON,
} from "@/lib/map/venue-pill-icon";

const SOURCE_ID = "campus-dining";
export const CAMPUS_DINING_LAYER_ID = "campus-dining-symbol";

// These pins are static and unclickable, so the whole layer is dimmed —
// it must read as background furniture next to full-opacity zone marks
// and cherry venue pills, not as another interactive layer.
const DINING_PIN_OPACITY = 0.65;

// Hidden at the campus overview (DEFAULT_VIEWPORT.zoom is 14.6): the pins
// only appear once the user has zoomed well past it, where individual
// buildings are the subject.
const DINING_PIN_MINZOOM = 16;

const FEATURE_COLLECTION = {
  type: "FeatureCollection" as const,
  features: CAMPUS_DINING_MARKERS.map((marker) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [marker.lng, marker.lat],
    },
    properties: { id: marker.id, label: marker.label },
  })),
};

/**
 * One neutral info pin per meal-plan dining building (config/campus-dining.ts):
 * white pill, stone border, ink-secondary regular text. Deliberately not a
 * venue pill — no cherry, no hover, no click, no mini-card — it only names
 * what the building holds, since meal-plan dining is out of scope.
 *
 * Mounted under VenuePillLayer (venue-map.tsx). All TuEats overlays sit
 * above Positron road names. Zoom-gated (`minzoom`): hidden at the campus
 * overview, appearing only once the user zooms in to building scale.
 * Placement matches the zone label plates (overlap allowed, placement
 * ignored) — without this, the campus building labels at the same
 * centroids place first and collide them away. They never compete with
 * decision info anyway: once a zone is selected the whole layer is hidden
 * (`visible`), and venue pills paint above them.
 */
export function CampusDiningLayer({
  map,
  visible = true,
}: {
  map: MapLibreMap | null;
  visible?: boolean;
}) {
  useEffect(() => {
    if (!map || map.getSource(SOURCE_ID)) return;

    // Style readiness is guaranteed for the same reason as VenuePillLayer:
    // the map is only handed down after its one-time "load" event.
    if (!map.hasImage(DINING_PILL_ICON)) {
      const asset = buildDiningPillIcon();
      map.addImage(DINING_PILL_ICON, asset, {
        pixelRatio: asset.pixelRatio,
        content: asset.content,
        stretchX: asset.stretchX,
        stretchY: asset.stretchY,
      });
    }

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: FEATURE_COLLECTION,
    });

    map.addLayer(
      {
        id: CAMPUS_DINING_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        minzoom: DINING_PIN_MINZOOM,
        layout: {
          "icon-image": DINING_PILL_ICON,
          "icon-text-fit": "width",
          "icon-text-fit-padding": [5, 10, 5, 10],
          "icon-padding": 0,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility: "none",
          "text-field": ["get", "label"],
          // Regular weight where venue pills are bold — quieter on purpose.
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            16,
            9,
            17,
            10,
            18.5,
            11,
          ],
          "text-max-width": 32,
          "text-line-height": 1.1,
          "text-padding": 1,
          "text-anchor": "bottom",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "icon-opacity": DINING_PIN_OPACITY,
          "text-opacity": DINING_PIN_OPACITY,
          "text-color": currentTheme() === "dark" ? "#BBA3A9" : "#57534E",
        },
      },
      beforeIdFor(map, CAMPUS_DINING_LAYER_ID),
    );
    liftOverlaysAboveBasemap(map);

    return () => {
      if (!map.getStyle()) return;
      if (map.getLayer(CAMPUS_DINING_LAYER_ID))
        map.removeLayer(CAMPUS_DINING_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  useEffect(() => {
    if (!map?.getLayer(CAMPUS_DINING_LAYER_ID)) return;
    map.setLayoutProperty(
      CAMPUS_DINING_LAYER_ID,
      "visibility",
      visible ? "visible" : "none",
    );
  }, [map, visible]);

  return null;
}
