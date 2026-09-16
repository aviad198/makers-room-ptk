import { limitsForTier, resolveTier } from './fairness';
import {
  durationMinutes,
  hoursBetween,
  intervalsOverlap,
  isAlignedToGranularity,
  overnightMinutes,
  startsInPrimeTime,
} from './time';
import type {
  BookingContext,
  BookingDecision,
  BookingRequest,
  ExistingReservation,
  RuleViolation,
  SchedulingPolicy,
  SlotClassification,
} from './types';

/** Statuses that still occupy time on a printer. */
const BLOCKING_STATUSES = new Set(['scheduled', 'in_progress']);

function error(code: string, message: string): RuleViolation {
  return { code, message, severity: 'error' };
}

function warn(code: string, message: string): RuleViolation {
  return { code, message, severity: 'warning' };
}

export function formatMinutes(total: number): string {
  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Describe the requested slot: how long it is, how much of it lands overnight,
 * and whether it falls inside the open (free-for-all) window.
 */
export function classifySlot(
  request: Pick<BookingRequest, 'startsAt' | 'endsAt'>,
  policy: SchedulingPolicy,
  now: Date,
): SlotClassification {
  const interval = { start: request.startsAt, end: request.endsAt };
  const total = durationMinutes(interval);
  const overnight =
    total > 0
      ? overnightMinutes(interval, policy.overnightStartHour, policy.overnightEndHour, policy.timeZone)
      : 0;
  const ratio = total > 0 ? overnight / total : 0;
  const leadTimeHours = hoursBetween(now, request.startsAt);

  return {
    durationMinutes: total,
    overnightMinutes: overnight,
    overnightRatio: ratio,
    isOvernight: ratio >= policy.overnightCoverageRatio,
    isLongPrint: total > policy.longPrintThresholdMinutes,
    isPrimeTime: startsInPrimeTime(
      request.startsAt,
      policy.primeTimeStartHour,
      policy.primeTimeEndHour,
      policy.timeZone,
    ),
    leadTimeHours,
    isOpenBooking: leadTimeHours <= policy.openBookingHours,
  };
}

/**
 * Evaluate a booking request against every house rule.
 *
 * Returns the full picture rather than throwing, so the UI can show all the
 * reasons a slot is unavailable at once, plus any prints that would be bumped.
 */
export function evaluateBooking(
  request: BookingRequest,
  context: BookingContext,
): BookingDecision {
  const { policy, profile, usage, now } = context;
  const violations: RuleViolation[] = [];
  const warnings: RuleViolation[] = [];

  const tier = resolveTier(usage, policy, now);
  const limits = limitsForTier(tier, policy);
  const classification = classifySlot(request, policy, now);
  const { durationMinutes: minutes, isOpenBooking } = classification;

  // --- Member eligibility -------------------------------------------------
  if (profile.isBlocked) {
    violations.push(
      error('member_blocked', 'Your account is suspended. Contact a makerspace admin.'),
    );
  }
  if (!profile.email) {
    violations.push(error('missing_email', 'Add an email address to your profile first.'));
  }
  if (!profile.phone) {
    violations.push(
      error(
        'missing_phone',
        'Add a phone number to your profile so we can reach you if a print fails.',
      ),
    );
  }
  if (!request.title.trim()) {
    violations.push(error('missing_title', 'Give your print a short name.'));
  }

  // --- Slot sanity --------------------------------------------------------
  if (minutes <= 0) {
    violations.push(error('invalid_range', 'The end time must be after the start time.'));
  }
  if (minutes > 0 && minutes < policy.minReservationMinutes) {
    violations.push(
      error(
        'too_short',
        `Minimum booking is ${formatMinutes(policy.minReservationMinutes)}.`,
      ),
    );
  }
  if (
    !isAlignedToGranularity(request.startsAt, policy.slotGranularityMinutes, policy.timeZone) ||
    !isAlignedToGranularity(request.endsAt, policy.slotGranularityMinutes, policy.timeZone)
  ) {
    violations.push(
      error(
        'misaligned',
        `Bookings must start and end on ${policy.slotGranularityMinutes}-minute boundaries.`,
      ),
    );
  }
  if (request.startsAt.getTime() <= now.getTime()) {
    violations.push(error('in_the_past', 'Pick a slot that starts in the future.'));
  }

  // --- Print length and the overnight rule --------------------------------
  if (minutes > 0) {
    if (classification.isOvernight) {
      if (minutes > policy.maxOvernightMinutes) {
        violations.push(
          error(
            'over_max_overnight',
            `Overnight prints are capped at ${formatMinutes(policy.maxOvernightMinutes)}.`,
          ),
        );
      }
    } else if (minutes > policy.maxDaytimeMinutes) {
      // Long prints belong overnight so the printers stay free during the day.
      violations.push(
        error(
          'long_print_must_be_overnight',
          `Prints longer than ${formatMinutes(policy.maxDaytimeMinutes)} must run overnight (at least ${Math.round(
            policy.overnightCoverageRatio * 100,
          )}% between ${policy.overnightStartHour}:00 and ${policy.overnightEndHour}:00). This slot is only ${Math.round(
            classification.overnightRatio * 100,
          )}% overnight.`,
        ),
      );
    }

    if (
      classification.isLongPrint &&
      classification.isOvernight &&
      minutes <= policy.maxOvernightMinutes
    ) {
      warnings.push(
        warn(
          'overnight_unattended',
          'Long overnight print: make sure the bed is clear and filament is loaded before you leave.',
        ),
      );
    }
    if (!classification.isLongPrint && classification.isOvernight) {
      warnings.push(
        warn(
          'short_overnight',
          'This is a short print in the overnight window. Consider a daytime slot and leave the night free for long jobs.',
        ),
      );
    }
  }

  // --- Urgent guard rails -------------------------------------------------
  if (request.priority === 'urgent') {
    if (policy.urgentRequiresJustification && !request.justification?.trim()) {
      violations.push(
        error(
          'urgent_needs_justification',
          'Urgent prints need a short note explaining the deadline.',
        ),
      );
    }
    if (usage.urgentInWindow >= policy.maxUrgentPerWindow) {
      violations.push(
        error(
          'urgent_quota',
          `You have used all ${policy.maxUrgentPerWindow} urgent bookings in the last ${policy.usageWindowDays} days.`,
        ),
      );
    }
  }

  // --- Fairness limits ----------------------------------------------------
  // Inside the open window every free slot is fair game, so these are skipped.
  if (isOpenBooking) {
    warnings.push(
      warn(
        'open_booking',
        `This slot starts within ${policy.openBookingHours}h, so it is open to any member regardless of quota.`,
      ),
    );
  } else {
    const horizonDays = classification.leadTimeHours / 24;
    if (horizonDays > limits.bookingHorizonDays) {
      violations.push(
        error(
          'beyond_horizon',
          `As a ${tier} user you can book up to ${limits.bookingHorizonDays} days ahead. This slot is ${Math.floor(
            horizonDays,
          )} days out. It opens to you on ${describeHorizonOpening(request.startsAt, limits.bookingHorizonDays)}, or within ${policy.openBookingHours}h of the start if nobody takes it.`,
        ),
      );
    }

    if (minutes > 0 && usage.weekMinutes + minutes > limits.weeklyMinutesCap) {
      violations.push(
        error(
          'weekly_cap',
          `This would put you at ${formatMinutes(
            usage.weekMinutes + minutes,
          )} in a 7-day span; your ${tier} limit is ${formatMinutes(limits.weeklyMinutesCap)}.`,
        ),
      );
    }

    if (usage.activeReservations >= limits.maxActiveReservations) {
      violations.push(
        error(
          'too_many_active',
          `You already hold ${usage.activeReservations} upcoming prints; your ${tier} limit is ${limits.maxActiveReservations}.`,
        ),
      );
    }

    if (
      classification.isPrimeTime &&
      usage.weekPrimeTimeReservations >= limits.primeTimeReservationsPerWeek
    ) {
      violations.push(
        error(
          'prime_time_cap',
          `You have reached your ${limits.primeTimeReservationsPerWeek} daytime bookings for this week. Try an overnight slot.`,
        ),
      );
    }
  }

  // --- Conflicts and pre-emption -----------------------------------------
  const preemptions: ExistingReservation[] = [];
  const requested = { start: request.startsAt, end: request.endsAt };

  const conflicts = context.printerReservations.filter(
    (reservation) =>
      reservation.printerId === request.printerId &&
      reservation.id !== request.reservationId &&
      BLOCKING_STATUSES.has(reservation.status) &&
      intervalsOverlap(requested, {
        start: reservation.startsAt,
        end: reservation.endsAt,
      }),
  );

  const canPreempt = policy.preemptibleBy[request.priority] ?? [];

  for (const conflict of conflicts) {
    if (conflict.userId === request.userId) {
      violations.push(
        error(
          'self_conflict',
          `This overlaps your own booking "${conflict.title}". Cancel or edit that one instead.`,
        ),
      );
      continue;
    }

    if (!canPreempt.includes(conflict.priority)) {
      violations.push(
        error(
          'slot_taken',
          `This printer is already booked for "${conflict.title}". Pick another time or the second printer.`,
        ),
      );
      continue;
    }

    const hasStarted =
      conflict.status === 'in_progress' || conflict.startsAt.getTime() <= now.getTime();
    if (hasStarted && !policy.allowPreemptInProgress) {
      violations.push(
        error(
          'in_progress_conflict',
          `"${conflict.title}" is already running and cannot be bumped. Book after it finishes.`,
        ),
      );
      continue;
    }

    preemptions.push(conflict);
  }

  if (preemptions.length > 0) {
    warnings.push(
      warn(
        'will_preempt',
        `This urgent job will bump ${preemptions.length} fun print${
          preemptions.length === 1 ? '' : 's'
        }. We will email and text the owner${preemptions.length === 1 ? '' : 's'} automatically.`,
      ),
    );
  }

  return {
    allowed: violations.length === 0,
    tier,
    classification,
    violations,
    warnings,
    preemptions,
  };
}

function describeHorizonOpening(startsAt: Date, horizonDays: number): string {
  const opensAt = new Date(startsAt.getTime() - horizonDays * 24 * 60 * 60 * 1000);
  return opensAt.toISOString().slice(0, 10);
}
