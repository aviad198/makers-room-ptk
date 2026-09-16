import type { PrintPriority, ReservationStatus } from '@/lib/scheduling';

/** Reservation shape passed from server components to the calendar. */
export interface CalendarReservation {
  id: string;
  printerId: string;
  userId: string;
  title: string;
  notes: string | null;
  priority: PrintPriority;
  status: ReservationStatus;
  /** ISO strings so the object survives the server/client boundary. */
  startsAt: string;
  endsAt: string;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  colorIndex: number;
}

export interface CalendarPrinter {
  id: string;
  name: string;
  model: string | null;
  notes: string | null;
}

export interface ViewerSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'member' | 'admin';
  tier: 'new' | 'regular' | 'heavy';
  tierExplanation: string;
}

export const PRIORITY_STYLES: Record<
  PrintPriority,
  { label: string; badge: string; dot: string }
> = {
  urgent: {
    label: 'Urgent work',
    badge: 'bg-rose-100 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
  },
  standard: {
    label: 'Work',
    badge: 'bg-sky-100 text-sky-700 ring-sky-200',
    dot: 'bg-sky-500',
  },
  fun: {
    label: 'Fun',
    badge: 'bg-violet-100 text-violet-700 ring-violet-200',
    dot: 'bg-violet-500',
  },
};
