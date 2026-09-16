import { describe, expect, it } from 'vitest';

import {
  isAlignedToGranularity,
  overnightMinutes,
  startsInPrimeTime,
  zonedHour,
  zonedWallTimeToDate,
} from '../time';

const TZ = 'Asia/Jerusalem';

/** Build an instant from Jerusalem wall-clock time in March 2026. */
const at = (day: number, hour: number, minute = 0) =>
  zonedWallTimeToDate(2026, 3, day, hour, minute, TZ);

describe('zonedWallTimeToDate', () => {
  it('round-trips wall-clock hours', () => {
    expect(zonedHour(at(4, 20), TZ)).toBe(20);
    expect(zonedHour(at(4, 0), TZ)).toBe(0);
    expect(zonedHour(at(4, 23, 45), TZ)).toBe(23);
  });

  it('normalises overflowing day numbers into the next month', () => {
    const rolled = zonedWallTimeToDate(2026, 3, 32, 9, 0, TZ);
    expect(rolled.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('stays correct across the spring DST transition', () => {
    // Israel moves to UTC+3 on 2026-03-27; both sides keep their local hour.
    expect(zonedHour(zonedWallTimeToDate(2026, 3, 26, 21, 0, TZ), TZ)).toBe(21);
    expect(zonedHour(zonedWallTimeToDate(2026, 3, 29, 21, 0, TZ), TZ)).toBe(21);
  });
});

describe('overnightMinutes', () => {
  it('counts a fully overnight print', () => {
    // 20:00 -> 06:00 sits entirely inside the 19:00-08:00 window.
    expect(overnightMinutes({ start: at(4, 20), end: at(5, 6) }, 19, 8, TZ)).toBe(600);
  });

  it('counts nothing for a midday print', () => {
    expect(overnightMinutes({ start: at(4, 10), end: at(4, 13) }, 19, 8, TZ)).toBe(0);
  });

  it('counts only the overnight tails of a print that straddles the day', () => {
    // 07:00 -> 21:00 touches 07:00-08:00 (60m) and 19:00-21:00 (120m).
    expect(overnightMinutes({ start: at(4, 7), end: at(4, 21) }, 19, 8, TZ)).toBe(180);
  });

  it('counts a print that crosses midnight', () => {
    // 23:00 -> 02:00 is entirely within the wrapping window.
    expect(overnightMinutes({ start: at(4, 23), end: at(5, 2) }, 19, 8, TZ)).toBe(180);
  });

  it('returns zero for an empty interval', () => {
    expect(overnightMinutes({ start: at(4, 10), end: at(4, 10) }, 19, 8, TZ)).toBe(0);
  });
});

describe('startsInPrimeTime', () => {
  it('detects daytime starts', () => {
    expect(startsInPrimeTime(at(4, 10), 8, 19, TZ)).toBe(true);
    expect(startsInPrimeTime(at(4, 8), 8, 19, TZ)).toBe(true);
  });

  it('excludes evening and early-morning starts', () => {
    expect(startsInPrimeTime(at(4, 19), 8, 19, TZ)).toBe(false);
    expect(startsInPrimeTime(at(4, 3), 8, 19, TZ)).toBe(false);
  });
});

describe('isAlignedToGranularity', () => {
  it('accepts quarter-hour boundaries', () => {
    expect(isAlignedToGranularity(at(4, 10, 0), 15, TZ)).toBe(true);
    expect(isAlignedToGranularity(at(4, 10, 45), 15, TZ)).toBe(true);
  });

  it('rejects off-grid minutes', () => {
    expect(isAlignedToGranularity(at(4, 10, 7), 15, TZ)).toBe(false);
  });
});
