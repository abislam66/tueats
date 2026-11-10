import { CAMPUS_TIMEZONE } from "@/config/site";

export const WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface HoursRange {
  open: string; // HH:mm local wall-clock
  close: string; // HH:mm local wall-clock
}

/** Weekday → ranges in America/New_York. null / missing day = closed that day. */
export type VenueHours = Partial<Record<WeekdayKey, HoursRange[]>>;

export type OpenStatus =
  | { kind: "unknown"; label: "Hours unknown" }
  | {
      kind: "open";
      label: string;
      closesAt: string;
    }
  | {
      kind: "closed";
      label: string;
      opensAt: string | null;
    };

const WEEKDAY_FROM_JS: WeekdayKey[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

/** Parse HH:mm to minutes since local midnight. */
export function parseWallClock(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new Error(`Invalid wall-clock time: ${time}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatWallClock(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDisplayTime(time: string): string {
  const minutes = parseWallClock(time);
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "p.m." : "a.m.";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0
    ? `${h12} ${period}`
    : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Parts of `date` in America/New_York.
 * Venue hours are wall-clock — never compare with UTC Date arithmetic directly.
 */
export function getCampusParts(date: Date): {
  weekday: WeekdayKey;
  minutes: number;
  year: number;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const weekdayMap: Record<string, WeekdayKey> = {
    Sun: "sun",
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
  };

  const weekday = weekdayMap[parts.weekday ?? ""];
  if (!weekday) {
    throw new Error(`Unexpected weekday: ${parts.weekday}`);
  }

  return {
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function rangesForDay(hours: VenueHours, weekday: WeekdayKey): HoursRange[] {
  return hours[weekday] ?? [];
}

/** True if `minutes` falls in a range; midnight-spanning (close < open) supported. */
export function isInRange(minutes: number, range: HoursRange): boolean {
  const open = parseWallClock(range.open);
  const close = parseWallClock(range.close);
  if (open === close) {
    return false;
  }
  if (close > open) {
    return minutes >= open && minutes < close;
  }
  // Spans midnight: open 22:00 close 02:00
  return minutes >= open || minutes < close;
}

function findOpenRange(
  hours: VenueHours,
  weekday: WeekdayKey,
  minutes: number,
): HoursRange | null {
  for (const range of rangesForDay(hours, weekday)) {
    if (isInRange(minutes, range)) {
      return range;
    }
  }
  // Also check previous day's midnight-spanning range
  const prevIdx = (WEEKDAY_FROM_JS.indexOf(weekday) + 6) % 7;
  const prevDay = WEEKDAY_FROM_JS[prevIdx]!;
  for (const range of rangesForDay(hours, prevDay)) {
    const open = parseWallClock(range.open);
    const close = parseWallClock(range.close);
    if (close <= open && minutes < close) {
      return range;
    }
  }
  return null;
}

function nextOpenAfter(
  hours: VenueHours,
  weekday: WeekdayKey,
  minutes: number,
): { dayOffset: number; time: string } | null {
  for (let offset = 0; offset < 7; offset++) {
    const idx = (WEEKDAY_FROM_JS.indexOf(weekday) + offset) % 7;
    const day = WEEKDAY_FROM_JS[idx]!;
    const ranges = [...rangesForDay(hours, day)].sort(
      (a, b) => parseWallClock(a.open) - parseWallClock(b.open),
    );
    for (const range of ranges) {
      const open = parseWallClock(range.open);
      if (offset === 0 && open <= minutes) {
        continue;
      }
      return { dayOffset: offset, time: range.open };
    }
  }
  return null;
}

/**
 * Compute open-now status from posted hours + a clock time.
 * Soft hours: labels use "usually". Unknown hours never say "Closed".
 */
export function getOpenStatus(
  hours: VenueHours | null | undefined,
  now: Date = new Date(),
): OpenStatus {
  if (!hours || Object.keys(hours).length === 0) {
    return { kind: "unknown", label: "Hours unknown" };
  }

  const hasAnyRange = WEEKDAY_KEYS.some((d) => (hours[d]?.length ?? 0) > 0);
  if (!hasAnyRange) {
    return { kind: "unknown", label: "Hours unknown" };
  }

  const { weekday, minutes } = getCampusParts(now);
  const openRange = findOpenRange(hours, weekday, minutes);

  if (openRange) {
    return {
      kind: "open",
      closesAt: openRange.close,
      label: `Open · usually until ${formatDisplayTime(openRange.close)}`,
    };
  }

  const next = nextOpenAfter(hours, weekday, minutes);
  if (!next) {
    return {
      kind: "closed",
      opensAt: null,
      label: "Closed · hours posted but no upcoming open time",
    };
  }

  const when =
    next.dayOffset === 0
      ? formatDisplayTime(next.time)
      : next.dayOffset === 1
        ? `${formatDisplayTime(next.time)} tomorrow`
        : formatDisplayTime(next.time);

  return {
    kind: "closed",
    opensAt: next.time,
    label: `Closed · opens ${when}`,
  };
}

/** Excluded from open-now filter; callers may surface "+N with unknown hours". */
export function isHoursUnknown(hours: VenueHours | null | undefined): boolean {
  return getOpenStatus(hours).kind === "unknown";
}

export function isOpenNow(
  hours: VenueHours | null | undefined,
  now: Date = new Date(),
): boolean {
  return getOpenStatus(hours, now).kind === "open";
}

/** Minutes until an open venue's current range closes, or null if not open. */
export function minutesUntilClose(
  hours: VenueHours | null | undefined,
  now: Date = new Date(),
): number | null {
  const status = getOpenStatus(hours, now);
  if (status.kind !== "open") return null;
  const { minutes } = getCampusParts(now);
  const close = parseWallClock(status.closesAt);
  return close > minutes ? close - minutes : close + 24 * 60 - minutes;
}

export const CLOSING_SOON_MINUTES = 60;

export type PinStatus = "open" | "closing" | "closed" | "unknown";

/** Map-pin status: open, closing within the hour, closed, or unknown hours. */
export function getPinStatus(
  hours: VenueHours | null | undefined,
  now: Date = new Date(),
): PinStatus {
  const status = getOpenStatus(hours, now);
  if (status.kind !== "open") return status.kind;
  const left = minutesUntilClose(hours, now);
  return left !== null && left <= CLOSING_SOON_MINUTES ? "closing" : "open";
}

/** Next opening for a closed venue: days from today (0 = later today) + time. */
export function nextOpening(
  hours: VenueHours | null | undefined,
  now: Date = new Date(),
): { dayOffset: number; time: string } | null {
  if (!hours) return null;
  const { weekday, minutes } = getCampusParts(now);
  if (findOpenRange(hours, weekday, minutes)) return null;
  return nextOpenAfter(hours, weekday, minutes);
}

/** "HH:MM" → "4:00 AM" (list and detail display times). */
export function formatClockTime(time: string): string {
  const minutes = parseWallClock(time);
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

/** "Monday, 9:40 PM" in campus time. */
export function formatCampusNow(now: Date = new Date()): string {
  const tz = "America/New_York";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return `${day}, ${time}`;
}

/** "6 hours 20 minutes" / "1 hour" / "45 minutes". */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m || !h) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

const DAY_NAMES: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type DetailStatus =
  | { kind: "unknown" }
  | {
      kind: "open";
      closesAt: string;
      /** "6 hours 20 minutes left tonight". */
      left: string;
      closingSoon: boolean;
    }
  | {
      kind: "closed";
      opensAt: string | null;
      /** "", "tomorrow", or a weekday name. */
      when: string;
    };

/** Wording for the place page's status card (campus time). */
export function getDetailStatus(
  hours: VenueHours | null | undefined,
  now: Date = new Date(),
): DetailStatus {
  const status = getOpenStatus(hours, now);
  if (status.kind === "unknown") return { kind: "unknown" };
  if (status.kind === "open") {
    const left = minutesUntilClose(hours, now) ?? 0;
    const close = parseWallClock(status.closesAt);
    // Evening or after-midnight closes read as "tonight".
    const tonight = close >= 17 * 60 || close < 5 * 60;
    return {
      kind: "open",
      closesAt: status.closesAt,
      left: `${formatDuration(left)} left ${tonight ? "tonight" : "today"}`,
      closingSoon: left <= CLOSING_SOON_MINUTES,
    };
  }
  const next = nextOpening(hours, now);
  if (!next) return { kind: "closed", opensAt: null, when: "" };
  let when = "";
  if (next.dayOffset === 1) when = "tomorrow";
  else if (next.dayOffset > 1) {
    const { weekday } = getCampusParts(now);
    const idx = (WEEKDAY_FROM_JS.indexOf(weekday) + next.dayOffset) % 7;
    when = DAY_NAMES[WEEKDAY_FROM_JS[idx]!];
  }
  return { kind: "closed", opensAt: next.time, when };
}

/** Campus weekday key for "today" (highlights the hours row). */
export function campusWeekday(now: Date = new Date()): WeekdayKey {
  return getCampusParts(now).weekday;
}
