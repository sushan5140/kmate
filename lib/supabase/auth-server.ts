import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Session-aware Supabase client for Server Components and Route Handlers --
 * reads/writes the user's auth cookies, using the anon key (respects RLS).
 * Distinct from lib/supabase/server.ts, which uses the service-role key and
 * bypasses RLS entirely for the app's own data-access routes.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render -- proxy.ts refreshes
            // the session cookie on the next request, so this is safe to
            // ignore here.
          }
        },
      },
    }
  );
}

/**
 * Reads the authenticated user from the request's session cookie, for use
 * at the top of API route handlers. Returns null rather than throwing --
 * callers should return a 401 themselves so the response shape matches the
 * rest of that route's error handling.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Guards a page: redirects to /login if signed out, and to /onboarding if
 * the profile's onboarding hasn't been completed. Call at the top of every
 * Server Component page that requires a fully set-up profile (/home,
 * /discover, /requests, etc).
 */
export async function requireOnboarded(nextPath: string): Promise<User> {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  return user;
}
