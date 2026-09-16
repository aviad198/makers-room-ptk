import type { FairnessTier, SchedulingPolicy, TierLimits, UserUsage } from './types';

/**
 * Classify a member into a fairness tier from their recent usage.
 *
 * `new` wins over `heavy` on purpose: somebody who just joined should never be
 * throttled, even if their first week is busy.
 */
export function resolveTier(usage: UserUsage, policy: SchedulingPolicy, now: Date): FairnessTier {
  const accountAgeDays =
    (now.getTime() - usage.accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000);

  const isNew =
    accountAgeDays < policy.newUserAccountAgeDays ||
    usage.lifetimeReservations < policy.newUserReservationThreshold;
  if (isNew) return 'new';

  const isHeavy =
    usage.windowMinutes >= policy.heavyMinutesThreshold ||
    usage.windowReservations >= policy.heavyReservationThreshold;
  if (isHeavy) return 'heavy';

  return 'regular';
}

export function limitsForTier(tier: FairnessTier, policy: SchedulingPolicy): TierLimits {
  return policy.tiers[tier];
}

/**
 * A human-readable explanation of why a member sits in their tier, shown in
 * the UI so the rules never feel arbitrary.
 */
export function describeTier(
  tier: FairnessTier,
  usage: UserUsage,
  policy: SchedulingPolicy,
): string {
  const hours = Math.round((usage.windowMinutes / 60) * 10) / 10;
  switch (tier) {
    case 'new':
      return `You are a new member, so you get the longest booking horizon (${policy.tiers.new.bookingHorizonDays} days) while you find your feet.`;
    case 'heavy':
      return `You have booked ${hours}h across ${usage.windowReservations} prints in the last ${policy.usageWindowDays} days, so you can book up to ${policy.tiers.heavy.bookingHorizonDays} days ahead. Slots inside the next ${policy.openBookingHours}h are always open to you.`;
    default:
      return `You have booked ${hours}h in the last ${policy.usageWindowDays} days and can book up to ${policy.tiers.regular.bookingHorizonDays} days ahead.`;
  }
}
