"use client";

import { useEffect, useState } from "react";

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles. Computed in the browser only. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** "0.2 mi"; under a tenth of a mile reads "0.1 mi" rather than "0.0". */
export function formatMiles(miles: number): string {
  return `${Math.max(0.1, miles).toFixed(1)} mi`;
}

/**
 * The visitor's position, but only when location access was ALREADY
 * granted (e.g. through the map's locate button). It never prompts, and
 * the coordinates never leave this component's consumers.
 */
export function useGrantedLocation(): LatLng | null {
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;

    function read() {
      if (!status || status.state !== "granted") {
        setPosition(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (result) => {
          if (cancelled) return;
          setPosition({
            lat: result.coords.latitude,
            lng: result.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
      );
    }

    async function init() {
      if (!navigator.permissions || !navigator.geolocation) return;
      try {
        status = await navigator.permissions.query({ name: "geolocation" });
      } catch {
        return;
      }
      if (cancelled) return;
      status.onchange = read;
      read();
    }
    void init();

    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, []);

  return position;
}
