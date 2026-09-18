import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// No `server-only` import here (deliberately): this module is also imported
// directly by standalone Node scripts under supabase/scripts/ (seed-*.ts, run
// via tsx outside Next's bundler), where the server-only guard throws
// unconditionally since it relies on a bundler condition tsx doesn't set.
// The real safety boundary is that SUPABASE_SERVICE_ROLE_KEY is never
// NEXT_PUBLIC_-prefixed, so Next.js strips it to `undefined` in any client
// bundle regardless -- this file accidentally reaching client code fails
// loudly (getSupabaseAdmin throws) rather than leaking the key.

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cached;
}
