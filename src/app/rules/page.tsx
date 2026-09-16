import Link from 'next/link';

import { DEFAULT_POLICY, formatMinutes, TIER_LABELS } from '@/lib/scheduling';

export const metadata = { title: 'Booking rules · MakersRoom PTK' };

/**
 * Public explainer for the house rules. Kept readable without a session so a
 * prospective member can see how the queue works before signing in.
 */
export default function RulesPage() {
  const policy = DEFAULT_POLICY;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to the schedule
      </Link>

      <h1 className="mt-6 text-2xl font-semibold text-slate-900">How the queue works</h1>
      <p className="mt-2 text-slate-600">
        Two printers, one shared workshop. These rules keep the machines busy, stop a
        few heavy users from taking every slot, and make sure urgent work can still get
        through.
      </p>

      <Rule title="Print length caps">
        <p>
          A daytime print can run up to {formatMinutes(policy.maxDaytimeMinutes)}. Overnight
          the cap rises to {formatMinutes(policy.maxOvernightMinutes)}, because the machine is
          not blocking anyone while you sleep.
        </p>
      </Rule>

      <Rule title="Long prints go overnight">
        <p>
          Anything longer than {formatMinutes(policy.longPrintThresholdMinutes)} must sit
          mostly inside the overnight window ({policy.overnightStartHour}:00–
          {policy.overnightEndHour}:00) — at least{' '}
          {Math.round(policy.overnightCoverageRatio * 100)}% of the run. This keeps the
          daytime free for quick iteration.
        </p>
      </Rule>

      <Rule title="Urgent work beats fun prints">
        <p>
          Bookings are marked <strong>fun</strong>, <strong>work</strong>, or{' '}
          <strong>urgent work</strong>. An urgent job may take over a slot held by a fun
          print; the owner is notified by email and phone straight away. Urgent never
          bumps other work, and never bumps a print that has already started.
        </p>
        <p className="mt-2">
          To stop the button being worn out, urgent bookings need a one-line reason and
          are limited to {policy.maxUrgentPerWindow} per {policy.usageWindowDays} days.
        </p>
      </Rule>

      <Rule title="Heavy users book closer to the day">
        <p>
          How far ahead you can book depends on how much you have printed in the last{' '}
          {policy.usageWindowDays} days:
        </p>
        <ul className="mt-3 space-y-1.5">
          {(['new', 'regular', 'heavy'] as const).map((tier) => (
            <li key={tier} className="flex flex-wrap gap-x-2 text-sm">
              <span className="font-medium text-slate-900">{TIER_LABELS[tier]}:</span>
              <span className="text-slate-600">
                up to {policy.tiers[tier].bookingHorizonDays} days ahead ·{' '}
                {formatMinutes(policy.tiers[tier].weeklyMinutesCap)} per week ·{' '}
                {policy.tiers[tier].maxActiveReservations} open bookings ·{' '}
                {policy.tiers[tier].primeTimeReservationsPerWeek} daytime slots per week
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          You become a heavy user past {formatMinutes(policy.heavyMinutesThreshold)} or{' '}
          {policy.heavyReservationThreshold} prints in {policy.usageWindowDays} days. The
          shorter horizon is the point: it leaves the far side of the calendar open for
          people who print less often. New members keep the longest horizon for their
          first {policy.newUserAccountAgeDays} days.
        </p>
      </Rule>

      <Rule title={`Free slots open to everyone ${policy.openBookingHours}h ahead`}>
        <p>
          Inside {policy.openBookingHours} hours of the start time, every quota is
          waived. If a slot is still empty, anyone can take it regardless of tier or
          weekly cap — an idle printer helps nobody.
        </p>
      </Rule>

      <Rule title="Contact details">
        <p>
          Every member has an email and phone on file. They are visible to other signed-in
          members so a failed print, a full bed, or a bumped slot can be sorted out
          quickly.
        </p>
      </Rule>

      <p className="mt-10 text-sm text-slate-400">
        Admins can tune every number above without a redeploy.
      </p>
    </main>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}
