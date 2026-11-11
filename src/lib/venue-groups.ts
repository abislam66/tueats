import { CUISINES } from "@/config/cuisines";
import { MAP_ZONES } from "@/config/map-zones";
import {
  CLOSING_SOON_MINUTES,
  getCampusParts,
  getOpenStatus,
  minutesUntilClose,
  nextOpening,
  parseWallClock,
} from "@/lib/hours";
import { OTHER_MAP_ZONE, type Venue } from "@/lib/venues";

export type VenueGroupKey = "open" | "closing" | "later" | "unknown";

export type GroupedVenue = {
  venue: Venue;
  /** Minutes left before close (open/closing only). */
  minutesLeft: number | null;
  /** Wall-clock "HH:MM" the row's big time shows: close or next open. */
  time: string | null;
  /** Closed venues: days until next open (0 = later today). */
  opensDayOffset: number | null;
};

export type VenueGroup = {
  key: VenueGroupKey;
  title: string;
  items: GroupedVenue[];
};

export const VENUE_GROUP_TITLES: Record<VenueGroupKey, string> = {
  open: "Open late, latest first",
  closing: "Closing within the hour",
  later: "Opens later",
  unknown: "Hours unknown",
};

const ORDER: VenueGroupKey[] = ["open", "closing", "later", "unknown"];

/**
 * Status-first list order: open-late (latest close first; after-midnight
 * closes count as latest), closing within the hour (soonest first),
 * opens later (soonest open first), hours unknown (A–Z). Empty groups
 * are dropped.
 */
export function groupVenuesByStatus(
  venues: Venue[],
  now: Date = new Date(),
): VenueGroup[] {
  const nowMinutes = getCampusParts(now).minutes;
  const buckets: Record<VenueGroupKey, (GroupedVenue & { sort: number })[]> = {
    open: [],
    closing: [],
    later: [],
    unknown: [],
  };

  for (const venue of venues) {
    const status = getOpenStatus(venue.hours, now);
    if (status.kind === "open") {
      const left = minutesUntilClose(venue.hours, now) ?? 0;
      const key = left <= CLOSING_SOON_MINUTES ? "closing" : "open";
      buckets[key].push({
        venue,
        minutesLeft: left,
        time: status.closesAt,
        opensDayOffset: null,
        sort: key === "open" ? -left : left,
      });
    } else if (status.kind === "closed") {
      const next = nextOpening(venue.hours, now);
      buckets.later.push({
        venue,
        minutesLeft: null,
        time: next?.time ?? null,
        opensDayOffset: next?.dayOffset ?? null,
        sort: next
          ? next.dayOffset * 24 * 60 + parseWallClock(next.time) - nowMinutes
          : Number.MAX_SAFE_INTEGER,
      });
    } else {
      buckets.unknown.push({
        venue,
        minutesLeft: null,
        time: null,
        opensDayOffset: null,
        sort: 0,
      });
    }
  }

  return ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: VENUE_GROUP_TITLES[key],
    items: buckets[key]
      .sort(
        (a, b) => a.sort - b.sort || a.venue.name.localeCompare(b.venue.name),
      )
      .map(({ venue, minutesLeft, time, opensDayOffset }) => ({
        venue,
        minutesLeft,
        time,
        opensDayOffset,
      })),
  }));
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Short place name for the plain-words line. `building` is whatever an
 * admin typed: a landmark ("Morgan Hall North") reads fine as-is, but a
 * street address ("1422 Cecil B. Moore Ave, Philadelphia, PA 19121") never
 * shows. A landmark ahead of an address ("Morgan Hall North, 1394 Cecil B.
 * Moore Ave, ...") keeps just the landmark; a bare address becomes the zone
 * name, or the street with its house number dropped.
 */
export function venuePlaceName(venue: Venue): string | null {
  const zone =
    venue.mapZone && venue.mapZone !== OTHER_MAP_ZONE
      ? MAP_ZONES[venue.mapZone].label
      : null;
  const first = venue.building?.split(",")[0]?.trim() || null;
  if (!first) return zone;
  if (!/\d/.test(first)) return first;
  const street = first.replace(/^\d+[A-Za-z]?\s+/, "").trim();
  return zone ?? (street && !/\d/.test(street) ? street : null);
}

const STREET_WORD = /\b(Street|St|Ave|Avenue|Walk|Blvd|Road|Rd)\b/i;

/**
 * "on Cecil B. Moore Ave" for a street or walk, "in Avery" for any other
 * area, "near ..." for a truck (it moves, so it's only ever approximate).
 * Null when the venue has no usable location.
 */
export function locationPhrase(venue: Venue): string | null {
  const place = venuePlaceName(venue);
  if (!place) return null;
  if (STREET_WORD.test(place)) return `on ${place}`;
  return `${venue.type === "truck" ? "near" : "in"} ${place}`;
}

/**
 * One plain-words line for a row: "American and halal, in Avery".
 * Cuisine names (max two) + halal, then a short place name.
 */
export function venuePlainLine(venue: Venue): string {
  const kinds = venue.cuisines.slice(0, 2).map((c, i) => {
    const label = CUISINES[c].label;
    return i === 0 ? label : label.toLowerCase();
  });
  if (venue.isHalal) kinds.push(kinds.length ? "halal" : "Halal");
  const what = joinAnd(kinds);
  const where = locationPhrase(venue) ?? "";
  if (what && where) return `${what}, ${where}`;
  return what || (where ? where[0]!.toUpperCase() + where.slice(1) : "");
}
