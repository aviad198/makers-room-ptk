import { NextResponse } from 'next/server';

import { evaluateRequest, getSessionContext } from '@/lib/bookings/service';
import { bookingInputSchema } from '@/lib/bookings/schemas';
import { createClient } from '@/lib/supabase/server';

/**
 * Dry-run a booking so the dialog can explain the house rules while the
 * member is still choosing a time. Never writes anything.
 */
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
    const supabase = await createClient();
    const { decision } = await evaluateRequest(supabase, session, parsed.data);
    return NextResponse.json({ decision });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
