import { describe, expect, it } from 'vitest';

import { resolveTier } from '../fairness';
import { DEFAULT_POLICY } from '../policy';
import { evaluateBooking } from '../rules';
import { zonedWallTimeToDate } from '../time';
import type {
  BookingContext,
  BookingRequest,
  ExistingReservation,
  MemberProfile,
  PrintPriority,
  UserUsage,
} from '../types';

const TZ = DEFAULT_POLICY.timeZone;
const PRINTER_A = 'printer-a';
const PRINTER_B = 'printer-b';

/** Jerusalem wall-clock time in March 2026. */
const at = (day: number, hour: number, minute = 0) =>
  zonedWallTimeToDate(2026, 3, day, hour, minute, TZ);

/** Monday 2 March 2026, 10:00 local. */
const NOW = at(2, 10);

function makeProfile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    id: 'user-1',
    email: 'maker@example.com',
    phone: '+972-50-000-0000',
    fullName: 'Test Maker',
    role: 'member',
    isBlocked: false,
    ...overrides,
  };
}

/** Defaults land the member in the `regular` tier. */
function makeUsage(overrides: Partial<UserUsage> = {}): UserUsage {
  return {
    accountCreatedAt: at(-200, 12),
    lifetimeReservations: 20,
    windowReservations: 2,
    windowMinutes: 300,
    activeReservations: 0,
    weekMinutes: 0,
    weekPrimeTimeReservations: 0,
    urgentInWindow: 0,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<ExistingReservation> = {}): ExistingReservation {
  return {
    id: 'res-existing',
    printerId: PRINTER_A,
    userId: 'other-user',
    title: 'Existing print',
    priority: 'fun',
    status: 'scheduled',
    startsAt: at(4, 10),
    endsAt: at(4, 13),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    printerId: PRINTER_A,
    userId: 'user-1',
    title: 'Bracket',
    priority: 'standard' as PrintPriority,
    startsAt: at(4, 10),
    endsAt: at(4, 13),
    ...overrides,
  };
}

function evaluate(
  request: Partial<BookingRequest> = {},
  context: Partial<BookingContext> = {},
) {
  return evaluateBooking(makeRequest(request), {
    now: NOW,
    policy: DEFAULT_POLICY,
    profile: makeProfile(),
    usage: makeUsage(),
    printerReservations: [],
    ...context,
  });
}

const codes = (result: ReturnType<typeof evaluate>) => result.violations.map((v) => v.code);

describe('contact details', () => {
  it('allows a well-formed daytime booking', () => {
    const result = evaluate();
    expect(result.violations).toEqual([]);
    expect(result.allowed).toBe(true);
  });

  it('requires a phone number', () => {
    const result = evaluate({}, { profile: makeProfile({ phone: null }) });
    expect(codes(result)).toContain('missing_phone');
    expect(result.allowed).toBe(false);
  });

  it('requires an email address', () => {
    const result = evaluate({}, { profile: makeProfile({ email: null }) });
    expect(codes(result)).toContain('missing_email');
  });

  it('blocks suspended members', () => {
    const result = evaluate({}, { profile: makeProfile({ isBlocked: true }) });
    expect(codes(result)).toContain('member_blocked');
  });
});

describe('slot sanity', () => {
  it('rejects an end before the start', () => {
    const result = evaluate({ startsAt: at(4, 13), endsAt: at(4, 10) });
    expect(codes(result)).toContain('invalid_range');
  });

  it('rejects bookings that are too short', () => {
    const result = evaluate({ startsAt: at(4, 10), endsAt: at(4, 10, 15) });
    expect(codes(result)).toContain('too_short');
  });

  it('rejects times that are off the 15-minute grid', () => {
    const result = evaluate({ startsAt: at(4, 10, 7), endsAt: at(4, 13) });
    expect(codes(result)).toContain('misaligned');
  });

  it('rejects slots in the past', () => {
    const result = evaluate({ startsAt: at(1, 10), endsAt: at(1, 13) });
    expect(codes(result)).toContain('in_the_past');
  });
});

describe('print length and the overnight rule', () => {
  it('allows a short daytime print', () => {
    const result = evaluate({ startsAt: at(4, 10), endsAt: at(4, 13) });
    expect(result.allowed).toBe(true);
    expect(result.classification.isOvernight).toBe(false);
    expect(result.classification.isLongPrint).toBe(false);
  });

  it('pushes a long daytime print to the overnight window', () => {
    // 6h during the day exceeds the 4h daytime cap.
    const result = evaluate({ startsAt: at(4, 10), endsAt: at(4, 16) });
    expect(codes(result)).toContain('long_print_must_be_overnight');
  });

  it('allows the same long print overnight', () => {
    // 20:00 -> 06:00 is a 10h job fully inside the overnight window.
    const result = evaluate({ startsAt: at(4, 20), endsAt: at(5, 6) });
    expect(result.violations).toEqual([]);
    expect(result.classification.isOvernight).toBe(true);
    expect(result.classification.isLongPrint).toBe(true);
  });

  it('caps overnight prints at the maximum duration', () => {
    // 18:00 -> 09:00 is 15h, beyond the 14h overnight cap.
    const result = evaluate({ startsAt: at(4, 18), endsAt: at(5, 9) });
    expect(codes(result)).toContain('over_max_overnight');
  });

  it('rejects a long print that merely clips the overnight window', () => {
    // 07:00 -> 21:00 is 14h but only ~21% overnight.
    const result = evaluate({ startsAt: at(4, 7), endsAt: at(4, 21) });
    expect(codes(result)).toContain('long_print_must_be_overnight');
    expect(result.classification.isOvernight).toBe(false);
  });

  it('nudges short prints out of the overnight window with a warning', () => {
    const result = evaluate({ startsAt: at(4, 20), endsAt: at(4, 21) });
    expect(result.allowed).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('short_overnight');
  });
});

describe('urgent jobs and pre-emption', () => {
  const urgent = {
    priority: 'urgent' as PrintPriority,
    justification: 'Customer demo tomorrow morning',
  };

  it('bumps a fun print', () => {
    const existing = makeReservation({ priority: 'fun' });
    const result = evaluate(urgent, { printerReservations: [existing] });

    expect(result.allowed).toBe(true);
    expect(result.preemptions).toHaveLength(1);
    expect(result.preemptions[0].id).toBe(existing.id);
    expect(result.warnings.map((w) => w.code)).toContain('will_preempt');
  });

  it('does not bump another work print', () => {
    const result = evaluate(urgent, {
      printerReservations: [makeReservation({ priority: 'standard' })],
    });
    expect(codes(result)).toContain('slot_taken');
    expect(result.preemptions).toEqual([]);
  });

  it('does not bump another urgent print', () => {
    const result = evaluate(urgent, {
      printerReservations: [makeReservation({ priority: 'urgent' })],
    });
    expect(codes(result)).toContain('slot_taken');
  });

  it('never bumps a print that is already running', () => {
    const result = evaluate(urgent, {
      printerReservations: [makeReservation({ priority: 'fun', status: 'in_progress' })],
    });
    expect(codes(result)).toContain('in_progress_conflict');
    expect(result.preemptions).toEqual([]);
  });

  it('does not let a fun print bump anything', () => {
    const result = evaluate(
      { priority: 'fun' },
      { printerReservations: [makeReservation({ priority: 'fun' })] },
    );
    expect(codes(result)).toContain('slot_taken');
  });

  it('requires a justification note', () => {
    const result = evaluate({ priority: 'urgent' });
    expect(codes(result)).toContain('urgent_needs_justification');
  });

  it('enforces the urgent quota', () => {
    const result = evaluate(urgent, {
      usage: makeUsage({ urgentInWindow: DEFAULT_POLICY.maxUrgentPerWindow }),
    });
    expect(codes(result)).toContain('urgent_quota');
  });

  it('ignores cancelled and already-preempted reservations', () => {
    const result = evaluate(
      {},
      {
        printerReservations: [
          makeReservation({ id: 'a', status: 'cancelled' }),
          makeReservation({ id: 'b', status: 'preempted' }),
        ],
      },
    );
    expect(result.allowed).toBe(true);
  });
});

describe('printer isolation', () => {
  it('treats the two printers independently', () => {
    const result = evaluate(
      { printerId: PRINTER_B },
      { printerReservations: [makeReservation({ printerId: PRINTER_A })] },
    );
    expect(result.allowed).toBe(true);
  });

  it('blocks double-booking yourself', () => {
    const result = evaluate(
      {},
      { printerReservations: [makeReservation({ userId: 'user-1', title: 'My other print' })] },
    );
    expect(codes(result)).toContain('self_conflict');
  });

  it('skips its own row when editing an existing booking', () => {
    const existing = makeReservation({ id: 'res-1', userId: 'user-1' });
    const result = evaluate(
      { reservationId: 'res-1' },
      { printerReservations: [existing] },
    );
    expect(result.allowed).toBe(true);
  });
});

describe('fairness tiers', () => {
  it('classifies a brand-new account as new', () => {
    const usage = makeUsage({ accountCreatedAt: at(1, 9), lifetimeReservations: 0 });
    expect(resolveTier(usage, DEFAULT_POLICY, NOW)).toBe('new');
  });

  it('classifies a high-volume account as heavy', () => {
    const usage = makeUsage({ windowMinutes: 31 * 60 });
    expect(resolveTier(usage, DEFAULT_POLICY, NOW)).toBe('heavy');
  });

  it('classifies a frequent-but-short account as heavy by count', () => {
    const usage = makeUsage({ windowReservations: 12 });
    expect(resolveTier(usage, DEFAULT_POLICY, NOW)).toBe('heavy');
  });

  it('keeps a new member out of the heavy bucket', () => {
    const usage = makeUsage({
      accountCreatedAt: at(1, 9),
      lifetimeReservations: 1,
      windowMinutes: 40 * 60,
    });
    expect(resolveTier(usage, DEFAULT_POLICY, NOW)).toBe('new');
  });
});

describe('booking horizon keeps slots open for lighter users', () => {
  const heavyUsage = makeUsage({ windowMinutes: 31 * 60 });

  it('stops a heavy user from booking far into the future', () => {
    // 12 days out, beyond the 5-day heavy horizon.
    const result = evaluate(
      { startsAt: at(14, 10), endsAt: at(14, 13) },
      { usage: heavyUsage },
    );
    expect(result.tier).toBe('heavy');
    expect(codes(result)).toContain('beyond_horizon');
  });

  it('lets a regular user book that same slot', () => {
    const result = evaluate({ startsAt: at(14, 10), endsAt: at(14, 13) });
    expect(result.tier).toBe('regular');
    expect(result.allowed).toBe(true);
  });

  it('gives new members the longest horizon', () => {
    // 20 days out: inside the 21-day new-member horizon, outside the 14-day one.
    const newUsage = makeUsage({ accountCreatedAt: at(1, 9), lifetimeReservations: 0 });
    const newMember = evaluate({ startsAt: at(22, 10), endsAt: at(22, 13) }, { usage: newUsage });
    expect(newMember.tier).toBe('new');
    expect(newMember.allowed).toBe(true);

    const regular = evaluate({ startsAt: at(22, 10), endsAt: at(22, 13) });
    expect(codes(regular)).toContain('beyond_horizon');
  });

  it('opens any free slot to a heavy user inside the 24h window', () => {
    // Same heavy user, but the slot starts in ~9h.
    const result = evaluate(
      { startsAt: at(2, 19), endsAt: at(2, 22) },
      { usage: heavyUsage },
    );
    expect(result.classification.isOpenBooking).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('open_booking');
  });

  it('still refuses a taken slot inside the 24h window', () => {
    const result = evaluate(
      { startsAt: at(2, 19), endsAt: at(2, 22) },
      {
        usage: heavyUsage,
        printerReservations: [
          makeReservation({ startsAt: at(2, 19), endsAt: at(2, 22), priority: 'standard' }),
        ],
      },
    );
    expect(codes(result)).toContain('slot_taken');
  });

  it('still enforces the overnight rule inside the 24h window', () => {
    const result = evaluate({ startsAt: at(2, 12), endsAt: at(2, 20) });
    expect(codes(result)).toContain('long_print_must_be_overnight');
  });
});

describe('volume quotas', () => {
  it('enforces the rolling weekly minutes cap', () => {
    const result = evaluate(
      {},
      { usage: makeUsage({ weekMinutes: DEFAULT_POLICY.tiers.regular.weeklyMinutesCap - 60 }) },
    );
    expect(codes(result)).toContain('weekly_cap');
  });

  it('limits how many upcoming prints a member may hold', () => {
    const result = evaluate(
      {},
      {
        usage: makeUsage({
          activeReservations: DEFAULT_POLICY.tiers.regular.maxActiveReservations,
        }),
      },
    );
    expect(codes(result)).toContain('too_many_active');
  });

  it('limits daytime bookings per week', () => {
    const result = evaluate(
      {},
      {
        usage: makeUsage({
          weekPrimeTimeReservations:
            DEFAULT_POLICY.tiers.regular.primeTimeReservationsPerWeek,
        }),
      },
    );
    expect(codes(result)).toContain('prime_time_cap');
  });

  it('does not apply the daytime cap to an overnight booking', () => {
    const result = evaluate(
      { startsAt: at(4, 20), endsAt: at(5, 6) },
      {
        usage: makeUsage({
          weekPrimeTimeReservations:
            DEFAULT_POLICY.tiers.regular.primeTimeReservationsPerWeek,
        }),
      },
    );
    expect(codes(result)).not.toContain('prime_time_cap');
    expect(result.allowed).toBe(true);
  });

  it('waives volume quotas inside the open window', () => {
    const result = evaluate(
      { startsAt: at(2, 19), endsAt: at(2, 22) },
      {
        usage: makeUsage({
          weekMinutes: DEFAULT_POLICY.tiers.regular.weeklyMinutesCap,
          activeReservations: 9,
          weekPrimeTimeReservations: 9,
        }),
      },
    );
    expect(result.allowed).toBe(true);
  });
});
