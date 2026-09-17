'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  buildWeekDays,
  formatDayHeading,
  formatTime,
  minutesSinceMidnight,
  segmentGeometry,
  splitIntoDaySegments,
  toDateKey,
} from '@/lib/calendar';
import { formatMinutes, type SchedulingPolicy } from '@/lib/scheduling';

import { BookingDialog } from './booking-dialog';
import {
  PRIORITY_STYLES,
  type CalendarPrinter,
  type CalendarReservation,
  type ViewerSummary,
} from './calendar-types';

const HOUR_HEIGHT = 48;
const DAY_HEIGHT = HOUR_HEIGHT * 24;

interface WeekCalendarProps {
  weekStartKey: string;
  printers: CalendarPrinter[];
  reservations: CalendarReservation[];
  policy: SchedulingPolicy;
  viewer: ViewerSummary;
}

export function WeekCalendar({
  weekStartKey,
  printers,
  reservations,
  policy,
  viewer,
}: WeekCalendarProps) {
  const router = useRouter();
  const [printerFilter, setPrinterFilter] = useState<string>('all');
  const [selected, setSelected] = useState<CalendarReservation | null>(null);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    printerId: string;
    dateKey: string;
    startTime: string;
  }>({
    open: false,
    printerId: printers[0]?.id ?? '',
    dateKey: weekStartKey,
    startTime: '09:00',
  });

  const weekDays = useMemo(
    () => buildWeekDays(new Date(`${weekStartKey}T12:00:00Z`), policy.timeZone),
    [weekStartKey, policy.timeZone],
  );

  // Drives the "now" marker and the currently-printing banner; ticks every
  // 30s rather than every render so it doesn't need to be perfectly live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = toDateKey(now, policy.timeZone);
  const todayIndex = weekDays.findIndex((day) => toDateKey(day, policy.timeZone) === todayKey);
  const nowMinutes = minutesSinceMidnight(now, policy.timeZone);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dayColumnRefs = useRef<Array<HTMLDivElement | null>>([]);

  // On phones the week doesn't fit on screen, so open scrolled to today
  // instead of forcing people to swipe past days that have already passed.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const column = todayIndex >= 0 ? dayColumnRefs.current[todayIndex] : null;
    if (!column) {
      container.scrollLeft = 0;
      return;
    }
    const gutterWidth = 56; // matches the 3.5rem hour-label column
    const offset = column.getBoundingClientRect().left - container.getBoundingClientRect().left;
    container.scrollLeft = Math.max(container.scrollLeft + offset - gutterWidth, 0);
  }, [todayIndex, weekStartKey]);

  const visible = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          (printerFilter === 'all' || reservation.printerId === printerFilter) &&
          reservation.status !== 'cancelled' &&
          reservation.status !== 'preempted',
      ),
    [reservations, printerFilter],
  );

  const segments = useMemo(
    () =>
      splitIntoDaySegments(
        visible,
        weekDays,
        (reservation) => ({
          start: new Date(reservation.startsAt),
          end: new Date(reservation.endsAt),
        }),
        policy.timeZone,
      ),
    [visible, weekDays, policy.timeZone],
  );

  const printerNames = useMemo(
    () => new Map(printers.map((printer) => [printer.id, printer.name])),
    [printers],
  );

  const mine = visible.filter((reservation) => reservation.userId === viewer.id).length;

  const printingNow = useMemo(
    () =>
      visible.filter((reservation) => {
        const start = new Date(reservation.startsAt).getTime();
        const end = new Date(reservation.endsAt).getTime();
        return now.getTime() >= start && now.getTime() < end;
      }),
    [visible, now],
  );

  function openBookingAt(dayIndex: number, hour: number) {
    setDialogState({
      open: true,
      printerId: printerFilter === 'all' ? printers[0]?.id ?? '' : printerFilter,
      dateKey: toDateKey(weekDays[dayIndex], policy.timeZone),
      startTime: `${String(hour).padStart(2, '0')}:00`,
    });
  }

  function goToWeek(offset: number) {
    const target = new Date(weekDays[0].getTime() + offset * 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams();
    params.set('week', toDateKey(target, policy.timeZone));
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <FilterButton
            active={printerFilter === 'all'}
            onClick={() => setPrinterFilter('all')}
          >
            All
          </FilterButton>
          {printers.map((printer) => (
            <FilterButton
              key={printer.id}
              active={printerFilter === printer.id}
              onClick={() => setPrinterFilter(printer.id)}
            >
              {printer.name}
            </FilterButton>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-slate-500 sm:inline">
            {visible.length} print{visible.length === 1 ? '' : 's'} this week · {mine} yours
          </span>
          <button
            type="button"
            onClick={() => goToWeek(-1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => goToWeek(1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => openBookingAt(0, 9)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Book
          </button>
        </div>
      </div>

      {printingNow.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          <span className="font-semibold">Printing now:</span>
          {printingNow.map((reservation) => (
            <span
              key={reservation.id}
              className="rounded-full bg-white px-2 py-0.5 ring-1 ring-rose-200"
            >
              {printerNames.get(reservation.printerId) ?? 'Printer'} · {reservation.ownerName}
              {' — until '}
              {formatTime(new Date(reservation.endsAt), policy.timeZone)}
            </span>
          ))}
        </div>
      ) : null}

      <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[46rem]">
          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-slate-200">
            <div className="sticky left-0 z-10 bg-white" />
            {weekDays.map((day) => {
              const heading = formatDayHeading(day, policy.timeZone);
              const isToday = toDateKey(day, policy.timeZone) === todayKey;
              return (
                <div key={day.toISOString()} className="px-2 py-2 text-center">
                  <div className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                    {heading.weekday}
                  </div>
                  <div
                    className={
                      isToday
                        ? 'mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white'
                        : 'mt-1 text-sm font-semibold text-slate-700'
                    }
                  >
                    {heading.date}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]">
            <div className="sticky left-0 z-10 bg-white" style={{ height: DAY_HEIGHT }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[0.7rem] text-slate-400"
                  style={{ top: hour * HOUR_HEIGHT }}
                >
                  {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                </div>
              ))}
              {todayIndex >= 0 ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 flex justify-end pr-1"
                  style={{ top: `${(nowMinutes / (24 * 60)) * 100}%` }}
                >
                  <span className="-translate-y-1/2 rounded bg-rose-500 px-1 py-0.5 text-[0.6rem] font-semibold leading-none text-white shadow">
                    {formatTime(now, policy.timeZone)}
                  </span>
                </div>
              ) : null}
            </div>

            {weekDays.map((day, dayIndex) => (
              <div
                key={day.toISOString()}
                ref={(el) => {
                  dayColumnRefs.current[dayIndex] = el;
                }}
                className="relative border-l border-slate-100"
                style={{ height: DAY_HEIGHT }}
              >
                <OvernightShading policy={policy} />

                {dayIndex === todayIndex ? (
                  <NowMarker topPercent={(nowMinutes / (24 * 60)) * 100} />
                ) : null}

                {Array.from({ length: 24 }, (_, hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => openBookingAt(dayIndex, hour)}
                    aria-label={`Book ${formatDayHeading(day, policy.timeZone).weekday} ${hour}:00`}
                    className="absolute inset-x-0 border-t border-slate-100 transition hover:bg-slate-50"
                    style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}

                {segments
                  .filter((segment) => segment.dayIndex === dayIndex)
                  .map((segment) => {
                    const reservation = segment.item;
                    const geometry = segmentGeometry(segment);
                    const isMine = reservation.userId === viewer.id;
                    const isLive =
                      dayIndex === todayIndex &&
                      now.getTime() >= new Date(reservation.startsAt).getTime() &&
                      now.getTime() < new Date(reservation.endsAt).getTime();
                    return (
                      <button
                        key={`${reservation.id}-${segment.dayIndex}`}
                        type="button"
                        onClick={() => setSelected(reservation)}
                        className={`member-${reservation.colorIndex % 12} absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-left text-white shadow-sm transition hover:brightness-95 ${
                          isMine ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                        } ${isLive ? 'ring-2 ring-rose-400 ring-offset-1' : ''}`}
                        style={{
                          top: `${geometry.top}%`,
                          height: `max(${geometry.height}%, 1.25rem)`,
                          backgroundColor: 'var(--member)',
                        }}
                      >
                        {isLive ? (
                          <span className="absolute right-1 top-1 flex items-center gap-1 rounded-full bg-rose-600/90 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                            Now
                          </span>
                        ) : null}
                        <span className="block text-[0.6rem] font-semibold uppercase opacity-80">
                          {printerNames.get(reservation.printerId) ?? ''}
                          {reservation.priority === 'urgent' ? ' · urgent' : ''}
                          {reservation.allowsJoiners
                            ? ` · 👥${
                                reservation.participants.length > 0
                                  ? ` ${reservation.participants.length}`
                                  : ''
                              }`
                            : ''}
                        </span>
                        <span className="block truncate text-[0.7rem] font-semibold leading-tight">
                          {segment.isStart ? reservation.title : `↳ ${reservation.title}`}
                        </span>
                        <span className="block truncate text-[0.65rem] opacity-90">
                          {reservation.ownerName}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend policy={policy} />

      {selected ? (
        <ReservationSheet
          reservation={selected}
          printerName={printerNames.get(selected.printerId) ?? ''}
          viewer={viewer}
          timeZone={policy.timeZone}
          onClose={() => setSelected(null)}
          onCancelled={() => {
            setSelected(null);
            router.refresh();
          }}
          onChanged={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      ) : null}

      <BookingDialog
        open={dialogState.open}
        onClose={() => setDialogState((state) => ({ ...state, open: false }))}
        printers={printers}
        policy={policy}
        initial={dialogState}
      />
    </div>
  );
}

/** Red "now" line across today's column, Google-Calendar style. */
function NowMarker({ topPercent }: { topPercent: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top: `${topPercent}%` }}
    >
      <span className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
      <span className="h-px flex-1 bg-rose-500" />
    </div>
  );
}

/** Tints the overnight window so long prints are easy to place. */
function OvernightShading({ policy }: { policy: SchedulingPolicy }) {
  const blocks =
    policy.overnightStartHour > policy.overnightEndHour
      ? [
          { top: 0, height: policy.overnightEndHour },
          { top: policy.overnightStartHour, height: 24 - policy.overnightStartHour },
        ]
      : [
          {
            top: policy.overnightStartHour,
            height: policy.overnightEndHour - policy.overnightStartHour,
          },
        ];

  return (
    <>
      {blocks.map((block) => (
        <div
          key={block.top}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bg-indigo-50/60"
          style={{ top: block.top * HOUR_HEIGHT, height: block.height * HOUR_HEIGHT }}
        />
      ))}
    </>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ policy }: { policy: SchedulingPolicy }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-indigo-50 ring-1 ring-indigo-200" />
        Overnight {policy.overnightStartHour}:00–{policy.overnightEndHour}:00 · best for
        prints over {formatMinutes(policy.longPrintThresholdMinutes)}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-white ring-1 ring-slate-300" />
        Working hours · counts towards your quota
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded ring-2 ring-slate-900" />
        Your prints
      </span>
      <span>👥 Open session — anyone may join.</span>
      <span>
        {policy.bufferMinutes} min gap between prints for clearing the bed.
      </span>
      <span>Each member has their own colour.</span>
    </div>
  );
}

function ReservationSheet({
  reservation,
  printerName,
  viewer,
  timeZone,
  onClose,
  onCancelled,
  onChanged,
}: {
  reservation: CalendarReservation;
  printerName: string;
  viewer: ViewerSummary;
  timeZone: string;
  onClose: () => void;
  onCancelled: () => void;
  onChanged: () => void;
}) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel =
    reservation.status === 'scheduled' &&
    (reservation.userId === viewer.id || viewer.role === 'admin');
  const style = PRIORITY_STYLES[reservation.priority];

  const hasJoined = reservation.participants.some(
    (participant) => participant.userId === viewer.id,
  );
  const canJoin =
    reservation.allowsJoiners &&
    reservation.userId !== viewer.id &&
    (reservation.status === 'scheduled' || reservation.status === 'in_progress') &&
    new Date(reservation.endsAt).getTime() > Date.now();

  async function cancel() {
    setIsCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${reservation.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? 'Could not cancel that print.');
        return;
      }
      onCancelled();
    } finally {
      setIsCancelling(false);
    }
  }

  async function toggleJoin() {
    setIsJoining(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${reservation.id}/join`, {
        method: hasJoined ? 'DELETE' : 'POST',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(
          body.error ?? (hasJoined ? 'Could not leave.' : 'Could not join that session.'),
        );
        return;
      }
      onChanged();
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{reservation.title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {printerName} ·{' '}
              {formatTime(new Date(reservation.startsAt), timeZone)}–
              {formatTime(new Date(reservation.endsAt), timeZone)}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${style.badge}`}
          >
            {style.label}
          </span>
        </div>

        {reservation.allowsJoiners ? (
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            👥 Open session — other members may join this print. Joining does not use
            any of your own quota.
          </p>
        ) : null}

        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Booked by" value={reservation.ownerName} />
          {reservation.ownerEmail ? (
            <Row
              label="Email"
              value={
                <a className="text-slate-900 underline" href={`mailto:${reservation.ownerEmail}`}>
                  {reservation.ownerEmail}
                </a>
              }
            />
          ) : null}
          {reservation.ownerPhone ? (
            <Row
              label="Phone"
              value={
                <a className="text-slate-900 underline" href={`tel:${reservation.ownerPhone}`}>
                  {reservation.ownerPhone}
                </a>
              }
            />
          ) : null}
          {reservation.notes ? <Row label="Notes" value={reservation.notes} /> : null}
          {reservation.participants.length > 0 ? (
            <Row
              label="Joined"
              value={reservation.participants.map((p) => p.name).join(', ')}
            />
          ) : null}
        </dl>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          {canJoin ? (
            <button
              type="button"
              onClick={toggleJoin}
              disabled={isJoining}
              className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                hasJoined
                  ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isJoining
                ? hasJoined
                  ? 'Leaving…'
                  : 'Joining…'
                : hasJoined
                  ? 'Leave session'
                  : 'Join this print'}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              onClick={cancel}
              disabled={isCancelling}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling…' : 'Cancel print'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}
