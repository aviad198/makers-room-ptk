import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * OAuth landing point. Supabase redirects here with a one-time code that we
 * exchange for a session cookie.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const oauthError = searchParams.get('error_description') ?? searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Sign-in was cancelled.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Only allow relative redirects so `next` cannot bounce users off-site.
  const target = next.startsWith('/') ? next : '/';
  return NextResponse.redirect(`${origin}${target}`);
}
