import { NextResponse } from 'next/server';

import {
  getSessionContext,
  joinReservation,
  leaveReservation,
} from '@/lib/bookings/service';

/** Join a print session its owner opened up to other members. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { id } = await params;
  const result = await joinReservation(session, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Step back out of a shared session. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { id } = await params;
  const result = await leaveReservation(session, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
