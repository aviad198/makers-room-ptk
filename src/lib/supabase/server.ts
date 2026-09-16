import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseAnonKey, getSupabaseUrl } from './env';
import type { Database } from './types';

/**
 * Supabase client bound to the caller's session cookies.
 * Use this for anything that should respect row level security.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
