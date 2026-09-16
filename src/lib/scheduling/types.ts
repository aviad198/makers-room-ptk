/**
 * Domain types for the MakersRoom PTK 3D-printer queue.
 *
 * The scheduling engine is intentionally free of any database or React
 * dependency so that every booking rule can be unit tested in isolation.
 */

/** Why a print is being queued. Drives pre-emption. */
export type PrintPriority = 'urgent' | 'standard' | 'fun';

export type ReservationStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'preempted';

/**
 * Fairness bucket a member falls into, derived from recent usage.
 * Heavy users get a shorter booking horizon so that they cannot claim
 * every future slot before lighter users get a chance.
 */
export type FairnessTier = 'new' | 'regular' | 'heavy';

export interface TierLimits {
  /** How many days into the future this tier may book. */
  bookingHorizonDays: number;
  /** Cap on total booked minutes within any rolling 7-day span. */
  weeklyMinutesCap: number;
  /** Cap on simultaneously held future reservations. */
  maxActiveReservations: number;
  /** Cap on daytime ("prime time") reservations per rolling 7 days. */
  primeTimeReservationsPerWeek: number;
}

export interface SchedulingPolicy {
  /** IANA timezone the physical makerspace lives in. */
  timeZone: string;

  /** Bookings must align to this many minutes. */
  slotGranularityMinutes: number;
  minReservationMinutes: number;

  /** A print that is not substantially overnight may not exceed this. */
  maxDaytimeMinutes: number;
  /** A print that qualifies as overnight may not exceed this. */
  maxOvernightMinutes: number;
  /** Prints longer than this must be scheduled overnight. */
  longPrintThresholdMinutes: number;

  /** Overnight window, e.g. 19:00 -> 08:00 local time. */
  overnightStartHour: number;
  overnightEndHour: number;
  /** Fraction of a print that must fall inside the overnight window. */
  overnightCoverageRatio: number;

  /** Prime time (daytime) window used for the prime-time fairness cap. */
  primeTimeStartHour: number;
  primeTimeEndHour: number;

  /**
   * Inside this many hours before start, any free slot is open to anyone:
   * horizon and quota limits are waived so slots never go to waste.
   */
  openBookingHours: number;

  /** Rolling window used to classify a member's usage. */
  usageWindowDays: number;
  heavyMinutesThreshold: number;
  heavyReservationThreshold: number;
  newUserAccountAgeDays: number;
  newUserReservationThreshold: number;

  tiers: Record<FairnessTier, TierLimits>;

  /** Guard rails so "urgent" cannot be abused. */
  maxUrgentPerWindow: number;
  urgentRequiresJustification: boolean;

  /** Which priorities each priority is allowed to bump. */
  preemptibleBy: Record<PrintPriority, PrintPriority[]>;
  /** Whether a print that already started may be bumped. */
  allowPreemptInProgress: boolean;
}

export interface ExistingReservation {
  id: string;
  printerId: string;
  userId: string;
  title: string;
  priority: PrintPriority;
  status: ReservationStatus;
  startsAt: Date;
  endsAt: Date;
}

/** Aggregated usage for the member making the request. */
export interface UserUsage {
  accountCreatedAt: Date;
  /** Reservations ever made that were not cancelled. */
  lifetimeReservations: number;
  /** Reservations starting within the rolling usage window. */
  windowReservations: number;
  /** Booked minutes within the rolling usage window. */
  windowMinutes: number;
  /** Currently held reservations that have not finished yet. */
  activeReservations: number;
  /** Booked minutes in the rolling 7 days around the requested slot. */
  weekMinutes: number;
  /** Prime-time reservations in the rolling 7 days around the slot. */
  weekPrimeTimeReservations: number;
  /** Urgent reservations created inside the usage window. */
  urgentInWindow: number;
}

export interface MemberProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: 'member' | 'admin';
  isBlocked: boolean;
}

export interface BookingRequest {
  printerId: string;
  userId: string;
  title: string;
  priority: PrintPriority;
  startsAt: Date;
  endsAt: Date;
  justification?: string | null;
  /** Set when editing an existing booking so it does not conflict with itself. */
  reservationId?: string | null;
}

export interface BookingContext {
  now: Date;
  policy: SchedulingPolicy;
  profile: MemberProfile;
  usage: UserUsage;
  /** Reservations on the requested printer that could overlap. */
  printerReservations: ExistingReservation[];
}

export type RuleSeverity = 'error' | 'warning';

export interface RuleViolation {
  code: string;
  message: string;
  severity: RuleSeverity;
}

export interface SlotClassification {
  durationMinutes: number;
  overnightMinutes: number;
  overnightRatio: number;
  isOvernight: boolean;
  isLongPrint: boolean;
  isPrimeTime: boolean;
  /** Hours from `now` until the slot starts. */
  leadTimeHours: number;
  /** True when the slot is inside the open (free-for-all) window. */
  isOpenBooking: boolean;
}

export interface BookingDecision {
  allowed: boolean;
  tier: FairnessTier;
  classification: SlotClassification;
  violations: RuleViolation[];
  warnings: RuleViolation[];
  /** Existing reservations that would be bumped if this booking proceeds. */
  preemptions: ExistingReservation[];
}
