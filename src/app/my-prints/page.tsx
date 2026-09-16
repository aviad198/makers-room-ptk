import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { PRIORITY_STYLES } from '@/components/calendar-types';
import { buildViewerSummary, usageHistoryRange } from '@/lib/bookings/viewer';
import { getSessionContext, loadPolicy, loadPrinters } from '@/lib/bookings/service';
import { formatTime } from '@/lib/calendar';
import { formatMinutes } from '@/lib/scheduling';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My prints · MakersRoom PTK' };

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-emerald-100 text-emerald-700' },
  in_progress: { label: 'Printing', className: 'bg-sky-100 text-sky-700' },
  completed: { label: 'Done', className: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500' },
  preempted: { label: 'Bumped', className: 'bg-amber-100 text-amber-700' },
};

export default async function MyPrintsPage() {
  if (!isSupabaseConfigured()) redirect('/login');

  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!session.profile.phone || !session.profile.full_name) redirect('/onboarding');

  const supabase = await createClient();
  const policy = await loadPolicy(supabase);
  const history = usageHistoryRange(policy);

  const [printers, { data: rows }] = await Promise.all([
    loadPrinters(supabase),
    supabase
      .from('reservations')
      .select('*')
      .eq('user_id', session.userId)
      .gte('starts_at', history.from.toISOString())
      .order('starts_at', { ascending: false }),
  ]);

  const reservations = rows ?? [];
  const viewer = buildViewerSummary(session.profile, reservations, policy);
  const printerNames = new Map(printers.map((printer) => [printer.id, printer.name]));

  const now = Date.now();
  const upcoming = reservations.filter(
    (row) => new Date(row.ends_at).getTime() >= now && row.status === 'scheduled',
  );
  const past = reservations.filter(
    (row) => new Date(row.ends_at).getTime() < now || row.status !== 'scheduled',
  );

  return (
    <div className="min-h-dvh">
      <AppHeader viewer={viewer} active="my-prints" />

      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-xl font-semibold text-slate-900">My prints</h1>
        <p className="mt-1 text-sm text-slate-500">{viewer.tierExplanation}</p>

        <Section title={`Upcoming (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <Empty>Nothing booked yet. Pick a slot on the schedule.</Empty>
          ) : (
            upcoming.map((row) => (
              <ReservationCard
                key={row.id}
                row={row}
                printerName={printerNames.get(row.printer_id) ?? ''}
                timeZone={policy.timeZone}
              />
            ))
          )}
        </Section>

        <Section title="History">
          {past.length === 0 ? (
            <Empty>No past prints yet.</Empty>
          ) : (
            past.map((row) => (
              <ReservationCard
                key={row.id}
                row={row}
                printerName={printerNames.get(row.printer_id) ?? ''}
                timeZone={policy.timeZone}
              />
            ))
          )}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
      {children}
    </p>
  );
}

function ReservationCard({
  row,
  printerName,
  timeZone,
}: {
  row: {
    id: string;
    title: string;
    priority: 'urgent' | 'standard' | 'fun';
    status: string;
    starts_at: string;
    ends_at: string;
    notes: string | null;
  };
  printerName: string;
  timeZone: string;
}) {
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  const status = STATUS_LABELS[row.status] ?? STATUS_LABELS.completed;
  const priority = PRIORITY_STYLES[row.priority];

  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(start);

  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-slate-900">{row.title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          {day} · {formatTime(start, timeZone)}–{formatTime(end, timeZone)} ·{' '}
          {formatMinutes(minutes)} · {printerName}
        </p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priority.badge}`}>
        {priority.label}
      </span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
        {status.label}
      </span>
    </article>
  );
}
