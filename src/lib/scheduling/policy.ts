import type { SchedulingPolicy } from './types';

/**
 * House rules for MakersRoom PTK.
 *
 * Every value here is also stored in the `policy_settings` table so admins can
 * tune the rules without a redeploy; this object is the fallback/default and
 * the single source of truth for the shape of a policy.
 */
export const DEFAULT_POLICY: SchedulingPolicy = {
  timeZone: 'Asia/Jerusalem',

  slotGranularityMinutes: 15,
  minReservationMinutes: 30,

  // A daytime print must finish inside a working afternoon.
  maxDaytimeMinutes: 4 * 60,
  // Overnight the machine can run long unattended jobs.
  maxOvernightMinutes: 14 * 60,
  // Anything longer than a daytime slot has to move overnight.
  longPrintThresholdMinutes: 4 * 60,

  overnightStartHour: 19,
  overnightEndHour: 8,
  overnightCoverageRatio: 0.7,

  primeTimeStartHour: 8,
  primeTimeEndHour: 19,

  openBookingHours: 24,

  usageWindowDays: 28,
  heavyMinutesThreshold: 30 * 60,
  heavyReservationThreshold: 10,
  newUserAccountAgeDays: 30,
  newUserReservationThreshold: 3,

  /**
   * The booking horizon is the main fairness lever: heavy users may only book
   * a few days out, so the far side of the calendar stays open for members who
   * print less often.
   */
  tiers: {
    new: {
      bookingHorizonDays: 21,
      weeklyMinutesCap: 25 * 60,
      maxActiveReservations: 5,
      primeTimeReservationsPerWeek: 4,
    },
    regular: {
      bookingHorizonDays: 14,
      weeklyMinutesCap: 20 * 60,
      maxActiveReservations: 4,
      primeTimeReservationsPerWeek: 3,
    },
    heavy: {
      bookingHorizonDays: 5,
      weeklyMinutesCap: 15 * 60,
      maxActiveReservations: 2,
      primeTimeReservationsPerWeek: 2,
    },
  },

  maxUrgentPerWindow: 2,
  urgentRequiresJustification: true,

  // Urgent work jobs bump hobby prints, never other work.
  preemptibleBy: {
    urgent: ['fun'],
    standard: [],
    fun: [],
  },
  allowPreemptInProgress: false,
};

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent work',
  standard: 'Work',
  fun: 'Fun',
};

export const TIER_LABELS: Record<string, string> = {
  new: 'New member',
  regular: 'Regular',
  heavy: 'Heavy user',
};

/** Merge a partial policy (e.g. from the DB) over the defaults. */
export function resolvePolicy(overrides?: Partial<SchedulingPolicy> | null): SchedulingPolicy {
  if (!overrides) return DEFAULT_POLICY;
  return {
    ...DEFAULT_POLICY,
    ...overrides,
    tiers: { ...DEFAULT_POLICY.tiers, ...(overrides.tiers ?? {}) },
    preemptibleBy: { ...DEFAULT_POLICY.preemptibleBy, ...(overrides.preemptibleBy ?? {}) },
  };
}
