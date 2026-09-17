/**
 * Timezone-aware time helpers.
 *
 * The makerspace has a single physical location, so every "overnight" or
 * "prime time" question is really a question about local wall-clock time.
 * These helpers use `Intl` so we stay correct across DST without pulling in
 * a timezone database at runtime.
 */

export const MINUTE_MS = 60_000;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Break an instant into local wall-clock fields for `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

/** Offset in ms between `timeZone` local time and UTC at the given instant. */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Truncate to whole seconds so sub-second noise cannot skew the offset.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a local wall-clock time in `timeZone` into an absolute instant.
 * Month/day/hour values may overflow (e.g. day 32) and are normalised.
 */
export function zonedWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // One refinement pass settles DST boundaries, where the offset used for the
  // first guess may differ from the offset actually in force at the result.
  const firstGuess = naive - getTimeZoneOffsetMs(new Date(naive), timeZone);
  const offset = getTimeZoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(naive - offset);
}

/** Midnight at the start of the local day containing `date`. */
export function zonedStartOfDay(date: Date, timeZone: string): Date {
  const { year, month, day } = getZonedParts(date, timeZone);
  return zonedWallTimeToDate(year, month, day, 0, 0, timeZone);
}

/** Local wall-clock hour (0-23) of `date`. */
export function zonedHour(date: Date, timeZone: string): number {
  return getZonedParts(date, timeZone).hour;
}

/** Local day of the week of `date`: 0 = Sunday ... 6 = Saturday. */
export function zonedWeekday(date: Date, timeZone: string): number {
  const { year, month, day } = getZonedParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Midnight at the start of the local calendar month containing `date`. */
export function zonedStartOfMonth(date: Date, timeZone: string): Date {
  const { year, month } = getZonedParts(date, timeZone);
  return zonedWallTimeToDate(year, month, 1, 0, 0, timeZone);
}

/** Midnight at the start of the next local calendar month after `date`. */
export function zonedStartOfNextMonth(date: Date, timeZone: string): Date {
  const { year, month } = getZonedParts(date, timeZone);
  return zonedWallTimeToDate(year, month + 1, 1, 0, 0, timeZone);
}

/**
 * Midnight on the Sunday that opens the local calendar week containing `date`.
 * The makerspace week runs Sunday -> Saturday, with Sun-Thu as working days.
 */
export function zonedStartOfWeek(date: Date, timeZone: string): Date {
  const { year, month, day } = getZonedParts(date, timeZone);
  return zonedWallTimeToDate(year, month, day - zonedWeekday(date, timeZone), 0, 0, timeZone);
}

export interface Interval {
  start: Date;
  end: Date;
}

/** Overlap between two intervals in minutes (0 when they do not touch). */
export function overlapMinutes(a: Interval, b: Interval): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end <= start ? 0 : (end - start) / MINUTE_MS;
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function durationMinutes(interval: Interval): number {
  return (interval.end.getTime() - interval.start.getTime()) / MINUTE_MS;
}

/**
 * Build the local overnight intervals that could touch `interval`.
 *
 * The overnight window wraps midnight (e.g. 19:00 -> 08:00), so each local day
 * contributes two pieces: an early-morning piece `[00:00, endHour)` and an
 * evening piece `[startHour, 24:00)`.
 */
function overnightIntervalsFor(
  interval: Interval,
  startHour: number,
  endHour: number,
  timeZone: string,
): Interval[] {
  const result: Interval[] = [];
  const firstDay = getZonedParts(interval.start, timeZone);
  const spanDays = Math.ceil(durationMinutes(interval) / (60 * 24)) + 1;

  for (let offset = -1; offset <= spanDays; offset += 1) {
    const day = firstDay.day + offset;

    if (endHour > 0) {
      result.push({
        start: zonedWallTimeToDate(firstDay.year, firstDay.month, day, 0, 0, timeZone),
        end: zonedWallTimeToDate(firstDay.year, firstDay.month, day, endHour, 0, timeZone),
      });
    }
    if (startHour < 24) {
      result.push({
        start: zonedWallTimeToDate(firstDay.year, firstDay.month, day, startHour, 0, timeZone),
        end: zonedWallTimeToDate(firstDay.year, firstDay.month, day + 1, 0, 0, timeZone),
      });
    }
  }
  return result;
}

/** How many minutes of `interval` fall inside the local overnight window. */
export function overnightMinutes(
  interval: Interval,
  startHour: number,
  endHour: number,
  timeZone: string,
): number {
  const total = durationMinutes(interval);
  if (total <= 0) return 0;
  // A window that never closes means everything counts as overnight.
  if (startHour <= endHour) return total;

  return overnightIntervalsFor(interval, startHour, endHour, timeZone).reduce(
    (sum, window) => sum + overlapMinutes(interval, window),
    0,
  );
}

/** True when the slot starts inside the local prime-time (daytime) window. */
export function startsInPrimeTime(
  date: Date,
  startHour: number,
  endHour: number,
  timeZone: string,
): boolean {
  const hour = zonedHour(date, timeZone);
  return startHour <= endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

/**
 * True when the slot starts during working hours on a working day.
 *
 * Nights and weekends are deliberately outside this window: they are the cheap
 * capacity the queue wants to push long jobs towards, so they do not count
 * against the working-week quotas.
 */
export function startsInWorkingDaytime(
  date: Date,
  startHour: number,
  endHour: number,
  workingDays: readonly number[],
  timeZone: string,
): boolean {
  return (
    workingDays.includes(zonedWeekday(date, timeZone)) &&
    startsInPrimeTime(date, startHour, endHour, timeZone)
  );
}

/**
 * How many minutes of `interval` fall inside working hours on a working day.
 *
 * Unlike `startsInWorkingDaytime` this measures overlap, so a print that spills
 * out of the afternoon only spends its daytime portion of the monthly budget.
 */
export function workingDaytimeMinutes(
  interval: Interval,
  startHour: number,
  endHour: number,
  workingDays: readonly number[],
  timeZone: string,
): number {
  const total = durationMinutes(interval);
  if (total <= 0 || startHour >= endHour || workingDays.length === 0) return 0;

  const first = getZonedParts(interval.start, timeZone);
  const spanDays = Math.ceil(total / (60 * 24)) + 1;
  let sum = 0;

  for (let offset = -1; offset <= spanDays; offset += 1) {
    const day = first.day + offset;
    const windowStart = zonedWallTimeToDate(
      first.year,
      first.month,
      day,
      startHour,
      0,
      timeZone,
    );
    if (!workingDays.includes(zonedWeekday(windowStart, timeZone))) continue;
    sum += overlapMinutes(interval, {
      start: windowStart,
      end: zonedWallTimeToDate(first.year, first.month, day, endHour, 0, timeZone),
    });
  }

  return sum;
}

/** True when `date` sits on a `granularity`-minute boundary in local time. */
export function isAlignedToGranularity(
  date: Date,
  granularityMinutes: number,
  timeZone: string,
): boolean {
  if (granularityMinutes <= 0) return true;
  const { hour, minute, second } = getZonedParts(date, timeZone);
  if (second !== 0 || date.getTime() % MINUTE_MS !== 0) return false;
  return (hour * 60 + minute) % granularityMinutes === 0;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** Add calendar days while preserving local wall-clock time across DST. */
export function addDays(date: Date, days: number, timeZone: string): Date {
  const parts = getZonedParts(date, timeZone);
  return zonedWallTimeToDate(
    parts.year,
    parts.month,
    parts.day + days,
    parts.hour,
    parts.minute,
    timeZone,
  );
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * MINUTE_MS);
}
