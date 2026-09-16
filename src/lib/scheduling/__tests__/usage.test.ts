import { describe, expect, it } from 'vitest';

import { DEFAULT_POLICY } from '../policy';
import { zonedWallTimeToDate } from '../time';
import { computeUsage, type UsageReservation } from '../usage';

const TZ = DEFAULT_POLICY.timeZone;
const at = (day: number, hour: number, minute = 0) =>
  zonedWallTimeToDate(2026, 3, day, hour, minute, TZ);

const NOW = at(2, 10);

function res(overrides: Partial<UsageReservation> & { id: string }): UsageReservation {
  return {
    startsAt: at(4, 10),
    endsAt: at(4, 13),
    priority: 'fun',
    status: 'scheduled',
    createdAt: at(1, 10),
    ...overrides,
  };
}

const base = { accountCreatedAt: at(-200, 12), now: NOW, policy: DEFAULT_POLICY };

describe('computeUsage', () => {
  it('ignores cancelled and preempted reservations', () => {
    const usage = computeUsage(
      [
        res({ id: 'a', status: 'cancelled' }),
        res({ id: 'b', status: 'preempted' }),
        res({ id: 'c', status: 'scheduled' }),
      ],
      { ...base, slotStart: at(4, 14) },
    );
    expect(usage.lifetimeReservations).toBe(1);
  });

  it('counts only upcoming reservations as active', () => {
    const usage = computeUsage(
      [
        res({ id: 'past', startsAt: at(1, 10), endsAt: at(1, 13), status: 'completed' }),
        res({ id: 'future', startsAt: at(4, 10), endsAt: at(4, 13) }),
      ],
      { ...base, slotStart: at(5, 10) },
    );
    expect(usage.activeReservations).toBe(1);
    expect(usage.lifetimeReservations).toBe(2);
  });

  it('excludes the reservation being edited', () => {
    const usage = computeUsage([res({ id: 'editing' })], {
      ...base,
      slotStart: at(4, 10),
      excludeReservationId: 'editing',
    });
    expect(usage.lifetimeReservations).toBe(0);
    expect(usage.weekMinutes).toBe(0);
  });

  it('sums booked minutes inside the rolling week', () => {
    const usage = computeUsage(
      [
        res({ id: 'a', startsAt: at(3, 10), endsAt: at(3, 13) }), // 180m
        res({ id: 'b', startsAt: at(5, 10), endsAt: at(5, 12) }), // 120m
      ],
      { ...base, slotStart: at(4, 10) },
    );
    expect(usage.weekMinutes).toBe(300);
  });

  it('catches bookings made out of order', () => {
    // Booking day 9 last must still see days 4 and 6 in the same 7-day span.
    const usage = computeUsage(
      [
        res({ id: 'a', startsAt: at(4, 10), endsAt: at(4, 14) }), // 240m
        res({ id: 'b', startsAt: at(6, 10), endsAt: at(6, 14) }), // 240m
      ],
      { ...base, slotStart: at(9, 10) },
    );
    expect(usage.weekMinutes).toBe(480);
  });

  it('drops reservations outside every relevant week window', () => {
    const usage = computeUsage(
      [res({ id: 'a', startsAt: at(4, 10), endsAt: at(4, 14) })],
      { ...base, slotStart: at(20, 10) },
    );
    expect(usage.weekMinutes).toBe(0);
  });

  it('counts prime-time reservations separately from overnight ones', () => {
    const usage = computeUsage(
      [
        res({ id: 'day', startsAt: at(3, 10), endsAt: at(3, 13) }),
        res({ id: 'night', startsAt: at(5, 20), endsAt: at(6, 6) }),
      ],
      { ...base, slotStart: at(4, 10) },
    );
    expect(usage.weekPrimeTimeReservations).toBe(1);
  });

  it('counts urgent bookings by when they were created', () => {
    const usage = computeUsage(
      [
        res({ id: 'recent', priority: 'urgent', createdAt: at(1, 10) }),
        res({ id: 'old', priority: 'urgent', createdAt: at(-60, 10) }),
      ],
      { ...base, slotStart: at(4, 10) },
    );
    expect(usage.urgentInWindow).toBe(1);
  });
});
