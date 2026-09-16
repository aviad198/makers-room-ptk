import { durationMinutes, startsInPrimeTime } from './time';
import type {
  PrintPriority,
  ReservationStatus,
  SchedulingPolicy,
  UserUsage,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** A member's own reservation, as needed to derive usage statistics. */
export interface UsageReservation {
  id: string;
  startsAt: Date;
  endsAt: Date;
  priority: PrintPriority;
  status: ReservationStatus;
  createdAt: Date;
}

/** Statuses that count towards a member's usage. */
const COUNTED_STATUSES = new Set<ReservationStatus>([
  'scheduled',
  'in_progress',
  'completed',
]);

function counts(reservation: UsageReservation): boolean {
  return COUNTED_STATUSES.has(reservation.status);
}

function reservationMinutes(reservation: UsageReservation): number {
  return durationMinutes({ start: reservation.startsAt, end: reservation.endsAt });
}

/**
 * Largest total of booked minutes across any rolling 7-day window that would
 * contain `slotStart`.
 *
 * Checking every candidate window (rather than just the preceding 7 days)
 * means a member cannot dodge the weekly cap by booking out of order.
 */
function worstCaseWeek(
  reservations: UsageReservation[],
  slotStart: Date,
  policy: SchedulingPolicy,
): { minutes: number; primeTime: number } {
  const anchors = [
    slotStart.getTime() - WEEK_MS,
    slotStart.getTime(),
    ...reservations.map((r) => r.startsAt.getTime()),
    ...reservations.map((r) => r.startsAt.getTime() - WEEK_MS),
  ];

  let minutes = 0;
  let primeTime = 0;

  for (const anchor of anchors) {
    const windowEnd = anchor + WEEK_MS;
    // Only windows that would also hold the new booking are relevant.
    if (slotStart.getTime() < anchor || slotStart.getTime() >= windowEnd) continue;

    let windowMinutes = 0;
    let windowPrime = 0;
    for (const reservation of reservations) {
      const start = reservation.startsAt.getTime();
      if (start < anchor || start >= windowEnd) continue;
      windowMinutes += reservationMinutes(reservation);
      if (
        startsInPrimeTime(
          reservation.startsAt,
          policy.primeTimeStartHour,
          policy.primeTimeEndHour,
          policy.timeZone,
        )
      ) {
        windowPrime += 1;
      }
    }

    minutes = Math.max(minutes, windowMinutes);
    primeTime = Math.max(primeTime, windowPrime);
  }

  return { minutes, primeTime };
}

/**
 * Turn a member's reservation history into the aggregates the rules engine
 * needs. `slotStart` is the start of the booking being evaluated.
 */
export function computeUsage(
  reservations: UsageReservation[],
  options: {
    accountCreatedAt: Date;
    now: Date;
    slotStart: Date;
    policy: SchedulingPolicy;
    /** Reservation being edited, excluded so it does not count against itself. */
    excludeReservationId?: string | null;
  },
): UserUsage {
  const { accountCreatedAt, now, slotStart, policy, excludeReservationId } = options;

  const relevant = reservations.filter(
    (r) => counts(r) && r.id !== excludeReservationId,
  );

  const windowStart = now.getTime() - policy.usageWindowDays * DAY_MS;
  const inWindow = relevant.filter((r) => r.startsAt.getTime() >= windowStart);

  const week = worstCaseWeek(relevant, slotStart, policy);

  return {
    accountCreatedAt,
    lifetimeReservations: relevant.length,
    windowReservations: inWindow.length,
    windowMinutes: inWindow.reduce((sum, r) => sum + reservationMinutes(r), 0),
    activeReservations: relevant.filter(
      (r) =>
        (r.status === 'scheduled' || r.status === 'in_progress') &&
        r.endsAt.getTime() > now.getTime(),
    ).length,
    weekMinutes: week.minutes,
    weekPrimeTimeReservations: week.primeTime,
    urgentInWindow: relevant.filter(
      (r) => r.priority === 'urgent' && r.createdAt.getTime() >= windowStart,
    ).length,
  };
}
