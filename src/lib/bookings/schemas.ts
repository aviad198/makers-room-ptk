import { z } from 'zod';

import { DEFAULT_POLICY } from '@/lib/scheduling';

/** Shared validation for anything that creates or previews a booking. */
export const bookingInputSchema = z
  .object({
    printerId: z.string().uuid('Pick a printer.'),
    title: z
      .string()
      .trim()
      .min(2, 'Give your print a short name.')
      .max(80, 'Keep the name under 80 characters.'),
    notes: z.string().trim().max(500).optional().nullable(),
    priority: z.enum(['urgent', 'standard', 'fun']),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    justification: z.string().trim().max(500).optional().nullable(),
    reservationId: z.string().uuid().optional().nullable(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'The end time must be after the start time.',
    path: ['endsAt'],
  });

export type BookingInput = z.infer<typeof bookingInputSchema>;

export const profileInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Tell us your name.')
    .max(80, 'Keep it under 80 characters.'),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9 ()\-]{7,20}$/,
      'Enter a reachable phone number, e.g. +972 50 123 4567.',
    ),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Policy overrides an admin may save. Every field is optional. */
export const policyInputSchema = z
  .object({
    maxDaytimeMinutes: z.number().int().min(30).max(24 * 60),
    maxOvernightMinutes: z.number().int().min(30).max(48 * 60),
    longPrintThresholdMinutes: z.number().int().min(30).max(24 * 60),
    overnightStartHour: z.number().int().min(0).max(23),
    overnightEndHour: z.number().int().min(0).max(23),
    openBookingHours: z.number().int().min(1).max(168),
    heavyMinutesThreshold: z.number().int().min(60),
    heavyReservationThreshold: z.number().int().min(1),
    maxUrgentPerWindow: z.number().int().min(0).max(20),
  })
  .partial();

export const DEFAULT_TIME_ZONE = DEFAULT_POLICY.timeZone;
