import { NextResponse } from 'next/server';

import { createReservation, getSessionContext } from '@/lib/bookings/service';
import { bookingInputSchema } from '@/lib/bookings/schemas';

/** Create a booking after the full rule set has approved it. */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bookingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid booking details.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await createReservation(session, parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, decision: result.decision },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { reservation: result.reservation, decision: result.decision },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
