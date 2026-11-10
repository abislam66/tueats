"use client";

import dynamic from "next/dynamic";

import type { MapZoneKey } from "@/config/map-zones";
import type { Venue } from "@/lib/venues";

function MapLoadingShell() {
  return (
    <div className="venue-map venue-map-shell" aria-label="Loading campus map">
      <div className="venue-map-loading" aria-live="polite">
        Loading campus map…
      </div>
    </div>
  );
}

const VenueMap = dynamic(
  () => import("@/components/map/venue-map").then((module) => module.VenueMap),
  {
    ssr: false,
    loading: () => <MapLoadingShell />,
  },
);

export function VenueMapLoader({
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
  phoneLayout,
}: {
  venues: Venue[];
  selectedId: string | null;
  hoveredId: string | null;
  backPath: string;
  selectedZones: MapZoneKey[];
  /** Signed-in members get a one-shot "locate me" on first map load. */
  isSignedIn: boolean;
  onSelect: (venueId: string) => void;
  onHover: (venueId: string | null) => void;
  onClearSelection: () => void;
  onSelectZone: (key: MapZoneKey | null) => void;
  phoneLayout?: boolean;
}) {
  return (
    <VenueMap
      backPath={backPath}
      hoveredId={hoveredId}
      isSignedIn={isSignedIn}
      onClearSelection={onClearSelection}
      onHover={onHover}
      onSelect={onSelect}
      onSelectZone={onSelectZone}
      phoneLayout={phoneLayout}
      selectedId={selectedId}
      selectedZones={selectedZones}
      venues={venues}
    />
  );
}
