import Link from 'next/link';

import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata = {
  title: 'Sign in · MakersRoom PTK',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') ? params.next : '/';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-xl">
              🖨️
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">MakersRoom PTK</h1>
            <p className="mt-2 text-sm text-slate-500">
              Book time on the workshop 3D printers.
            </p>
          </div>

          {params.error ? (
            <p
              role="alert"
              className="mb-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {params.error}
            </p>
          ) : null}

          {isSupabaseConfigured() ? (
            <GoogleSignInButton next={next} />
          ) : (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Not configured yet</p>
              <p className="mt-1">
                Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then
                reload. See the README for the full setup.
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Members sign in with their Google account. New here? Signing in creates
            your membership automatically.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/rules" className="font-medium text-slate-700 hover:underline">
            Read the booking rules
          </Link>
        </p>
      </div>
    </main>
  );
}
