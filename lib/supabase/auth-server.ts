import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
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
 * Minimal shape every current caller actually needs -- just `.id`. Was
 * previously the full Supabase `User` object; see getAuthenticatedUser()'s
 * comment for why that required a network round-trip this no longer does.
 */
export interface AuthenticatedUser {
  id: string;
}

/**
 * Reads the already-validated user id proxy.ts forwards via the
 * x-kmate-user-id header, instead of independently calling
 * supabase.auth.getUser() again. proxy.ts already made that exact call for
 * this request and redirected unauthenticated visitors away from every
 * non-public path (which is every path this function is ever called from --
 * see PUBLIC_PATHS in proxy.ts) before this code runs, so re-validating here
 * repeated that same network round-trip for no reason. proxy.ts also
 * unconditionally strips any client-supplied value for this header before
 * ever setting it itself, so trusting it here is the same trust boundary
 * AppShell/AuthedNav already rely on, not a new one.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const userId = (await headers()).get("x-kmate-user-id");
  return userId ? { id: userId } : null;
}

/**
 * Guards a page: redirects to /login if signed out, and to /onboarding if
 * the profile's onboarding hasn't been completed. Call at the top of every
 * Server Component page that requires a fully set-up profile (/home,
 * /discover, /requests, etc).
 */
export async function requireOnboarded(nextPath: string): Promise<AuthenticatedUser> {
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
