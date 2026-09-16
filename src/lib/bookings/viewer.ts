import 'server-only';

import {
  computeUsage,
  describeTier,
  resolveTier,
  type SchedulingPolicy,
} from '@/lib/scheduling';
import type { UsageReservation } from '@/lib/scheduling/usage';
import type { ProfileRow, ReservationRow } from '@/lib/supabase/types';
import type { ViewerSummary } from '@/components/calendar-types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the header/summary view of the signed-in member, including which
 * fairness tier they currently sit in and why.
 */
export function buildViewerSummary(
  profile: ProfileRow,
  reservations: ReservationRow[],
  policy: SchedulingPolicy,
  now: Date = new Date(),
): ViewerSummary {
  const usageReservations: UsageReservation[] = reservations.map((row) => ({
    id: row.id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    priority: row.priority,
    status: row.status,
    createdAt: new Date(row.created_at),
  }));

  const usage = computeUsage(usageReservations, {
    accountCreatedAt: new Date(profile.created_at),
    now,
    // Tier reflects current standing, so measure it against "now".
    slotStart: now,
    policy,
  });

  const tier = resolveTier(usage, policy, now);

  return {
    id: profile.id,
    name: profile.full_name || profile.email || 'Member',
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    tier,
    tierExplanation: describeTier(tier, usage, policy),
  };
}

/** Window of a member's history wide enough to classify their usage. */
export function usageHistoryRange(policy: SchedulingPolicy, now: Date = new Date()) {
  return {
    from: new Date(now.getTime() - (policy.usageWindowDays + 14) * DAY_MS),
    to: new Date(now.getTime() + 60 * DAY_MS),
  };
}
