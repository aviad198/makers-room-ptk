import { NextResponse } from 'next/server';

import { cancelReservation, getSessionContext } from '@/lib/bookings/service';

/** Cancel a booking, freeing the slot for anyone else to claim. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { id } = await params;
  const result = await cancelReservation(session, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
