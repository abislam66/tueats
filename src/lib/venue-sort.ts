import {
  CLOSING_SOON_MINUTES,
  getCampusParts,
  getOpenStatus,
  minutesUntilClose,
  nextOpening,
  parseWallClock,
} from "@/lib/hours";
import type { Venue } from "@/lib/venues";

export type VenueSort = "earliest" | "latest" | "nearest";

/** Chip text: "Sort: Earliest". */
export const VENUE_SORT_SHORT: Record<VenueSort, string> = {
  earliest: "Earliest",
  latest: "Latest",
  nearest: "Nearest",
};

/** Sheet row titles. */
export const VENUE_SORT_TITLES: Record<VenueSort, string> = {
  earliest: "Earliest to latest",
  latest: "Latest to earliest",
  nearest: "Nearest",
};

export type SortBand =
  | "within-hour"
  | "tonight"
  | "past-midnight"
  | "nearest"
  | "closed"
  | "unknown";

export const BAND_TITLES: Record<SortBand, string> = {
  "within-hour": "Closing within the hour",
  tonight: "Closing tonight",
  "past-midnight": "Open past midnight",
  nearest: "Nearest open now",
  closed: "Closed now",
  unknown: "Hours unknown",
};

export type SortedItem = {
  venue: Venue;
  /** Minutes until close (open venues only). */
  minutesLeft: number | null;
  /** "HH:MM" the venue closes (open venues only). */
  closesAt: string | null;
};

export type SortedGroup = {
  key: SortBand;
  title: string;
  items: SortedItem[];
};

/** Location off means Nearest is never in effect, whatever was picked. */
export function resolveSort(sort: VenueSort, hasLocation: boolean): VenueSort {
  return sort === "nearest" && !hasLocation ? "earliest" : sort;
}

/**
 * Which band an open venue falls in. All in campus time: `now` is read as
 * minutes since campus midnight, so a 2 AM close tonight is later than an
 * 11 PM one (it lands past midnight), and a close exactly at midnight is
 * still "tonight".
 */
export function bandFor(minutesLeft: number, nowMinutes: number): SortBand {
  if (minutesLeft < CLOSING_SOON_MINUTES) return "within-hour";
  return nowMinutes + minutesLeft > 24 * 60 ? "past-midnight" : "tonight";
}

const EARLIEST_ORDER: SortBand[] = ["within-hour", "tonight", "past-midnight"];
const LATEST_ORDER: SortBand[] = ["past-midnight", "tonight", "within-hour"];

const byName = (a: SortedItem, b: SortedItem) =>
  a.venue.name.localeCompare(b.venue.name);

/**
 * The list's order. Open venues are banded by when they close (earliest
 * first, or the exact reverse), or, for Nearest, one distance-ordered group
 * (ties broken by close time). Closed venues, then unknown-hours venues,
 * always trail; with `includeClosed` false (Open now) both are dropped.
 */
export function sortVenues(
  venues: Venue[],
  now: Date,
  sort: VenueSort,
  distances: Map<string, number>,
  options: { includeClosed?: boolean } = {},
): SortedGroup[] {
  const includeClosed = options.includeClosed ?? true;
  const nowMinutes = getCampusParts(now).minutes;
  const open: (SortedItem & { band: SortBand })[] = [];
  const closed: (SortedItem & { opensIn: number })[] = [];
  const unknown: SortedItem[] = [];

  for (const venue of venues) {
    const status = getOpenStatus(venue.hours, now);
    if (status.kind === "open") {
      const minutesLeft = minutesUntilClose(venue.hours, now) ?? 0;
      open.push({
        venue,
        minutesLeft,
        closesAt: status.closesAt,
        band: bandFor(minutesLeft, nowMinutes),
      });
    } else if (!includeClosed) {
      continue;
    } else if (status.kind === "closed") {
      const next = nextOpening(venue.hours, now);
      closed.push({
        venue,
        minutesLeft: null,
        closesAt: null,
        opensIn: next
          ? next.dayOffset * 24 * 60 + parseWallClock(next.time) - nowMinutes
          : Number.MAX_SAFE_INTEGER,
      });
    } else {
      unknown.push({ venue, minutesLeft: null, closesAt: null });
    }
  }

  const distance = (item: SortedItem) =>
    distances.get(item.venue.id) ?? Number.POSITIVE_INFINITY;
  const left = (item: SortedItem) => item.minutesLeft ?? 0;
  const groups: SortedGroup[] = [];

  if (sort === "nearest") {
    const items = [...open].sort(
      (a, b) => distance(a) - distance(b) || left(a) - left(b) || byName(a, b),
    );
    if (items.length > 0) {
      groups.push({ key: "nearest", title: BAND_TITLES.nearest, items });
    }
  } else {
    const order = sort === "earliest" ? EARLIEST_ORDER : LATEST_ORDER;
    for (const band of order) {
      const items = open
        .filter((item) => item.band === band)
        .sort((a, b) =>
          sort === "earliest"
            ? left(a) - left(b) || byName(a, b)
            : left(b) - left(a) || byName(a, b),
        );
      if (items.length > 0) {
        groups.push({ key: band, title: BAND_TITLES[band], items });
      }
    }
  }

  if (closed.length > 0) {
    closed.sort((a, b) =>
      sort === "nearest"
        ? distance(a) - distance(b) || byName(a, b)
        : a.opensIn - b.opensIn || byName(a, b),
    );
    groups.push({ key: "closed", title: BAND_TITLES.closed, items: closed });
  }
  if (unknown.length > 0) {
    unknown.sort(byName);
    groups.push({ key: "unknown", title: BAND_TITLES.unknown, items: unknown });
  }
  return groups;
}
