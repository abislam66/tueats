"use client";

import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { beforeIdFor, liftOverlaysAboveBasemap } from "@/lib/map/overlay-order";
import { currentTheme } from "@/lib/theme";

const SOURCE_ID = "campus-buildings";
const FILL_LAYER_ID = "campus-buildings-fill";
const LINE_LAYER_ID = "campus-buildings-outline";
const LABEL_LAYER_ID = "campus-buildings-label";
const GEOJSON_URL = "/maps/campus-buildings.geojson?v=athletics-1";

/**
 * Curated Temple main-campus footprints over a muted Positron basemap.
 * Per-building look comes from GeoJSON paint properties (`fill`, `stroke`, `labelColor`).
 */
export function CampusBuildingLayer({ map }: { map: MapLibreMap | null }) {
  useEffect(() => {
    if (!map) return;
    const dark = currentTheme() === "dark";

    let cancelled = false;

    function addLayers() {
      if (cancelled || !map || map.getSource(SOURCE_ID)) return;

      // Mute stock OpenMapTiles footprints so curated shapes read clearly.
      if (map.getLayer("building")) {
        map.setPaintProperty("building", "fill-opacity", 0.22);
        map.setPaintProperty("building", "fill-outline-color", "rgba(0,0,0,0)");
      }

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: GEOJSON_URL,
        promoteId: "osmId",
      });

      map.addLayer(
        {
          id: FILL_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: {
            "fill-color": dark
              ? "#2A1820"
              : ["coalesce", ["get", "fill"], "#EAE9E4"],
            "fill-opacity": dark
              ? 0.95
              : ["coalesce", ["get", "fillOpacity"], 0.92],
          },
        },
        beforeIdFor(map, FILL_LAYER_ID),
      );

      map.addLayer(
        {
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": dark
              ? "#4A3039"
              : ["coalesce", ["get", "stroke"], "#C5C4BE"],
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0.6,
              16,
              1.1,
              18,
              1.6,
            ],
            "line-opacity": 0.95,
          },
        },
        beforeIdFor(map, LINE_LAYER_ID),
      );

      map.addLayer(
        {
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: SOURCE_ID,
          minzoom: 14.4,
          layout: {
            "text-field": ["coalesce", ["get", "label"], ["get", "name"]],
            "text-font": ["Noto Sans Regular"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              15.2,
              10,
              17,
              12,
              18.5,
              13,
            ],
            "text-max-width": 8,
            "text-line-height": 1.1,
            "text-padding": 2,
            "text-allow-overlap": false,
            "symbol-sort-key": [
              "match",
              ["get", "category"],
              "library",
              1,
              "student-life",
              2,
              "academic",
              3,
              "landmark",
              4,
              8,
            ],
          },
          paint: {
            "text-color": dark
              ? "#BBA3A9"
              : ["coalesce", ["get", "labelColor"], "#3D3A35"],
            "text-halo-color": "rgba(255,255,255,0.88)",
            "text-halo-width": 1.25,
            "text-halo-blur": 0.4,
          },
        },
        beforeIdFor(map, LABEL_LAYER_ID),
      );

      liftOverlaysAboveBasemap(map);
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("load", addLayers);
    }

    return () => {
      cancelled = true;
      if (!map.getStyle()) return;
      for (const id of [LABEL_LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}
