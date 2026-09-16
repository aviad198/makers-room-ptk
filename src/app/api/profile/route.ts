import { NextResponse } from 'next/server';

import { getSessionContext } from '@/lib/bookings/service';
import { profileInputSchema } from '@/lib/bookings/schemas';
import { createClient } from '@/lib/supabase/server';

/** Save the contact details we need to reach a member about their print. */
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid contact details.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // RLS restricts this update to the caller's own row.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq('id', session.userId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ profile: data });
}
