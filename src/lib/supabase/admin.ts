import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env';
import type { Database } from './types';

/**
 * Service-role client. Bypasses row level security.
 *
 * Only booking endpoints use this, and only after `evaluateBooking` has
 * approved the request. Never import this from a client component.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
