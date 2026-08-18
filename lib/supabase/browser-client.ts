import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Hands the current access token to the Realtime socket, and MUST be awaited
 * before subscribing to any RLS-protected table.
 *
 * Realtime authorises separately from PostgREST. This client hydrates its
 * session from cookies rather than from a sign-in event, so no auth-state
 * change ever fires and the websocket would otherwise connect as `anon`.
 * PostgREST reads keep working (they attach the token per request), which
 * makes the failure silent and easy to miss: subscriptions report SUBSCRIBED
 * and then simply never deliver, because RLS correctly refuses to send an
 * anonymous socket rows it can't read.
 */
export async function ensureRealtimeAuth(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) supabase.realtime.setAuth(session.access_token);
  return session?.access_token ?? null;
}
