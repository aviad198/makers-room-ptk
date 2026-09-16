'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getSupabaseAnonKey, getSupabaseUrl } from './env';
import type { Database } from './types';

/** Supabase client for use in client components. */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
