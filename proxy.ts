import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Unlike a typical "protect one section" setup, almost everything in GKS
// Connect requires auth -- the matcher below runs on every request except
// the public marketing/legal/auth surface, and this function redirects
// signed-out visitors to /login. (Next.js 16 renamed middleware.ts ->
// proxy.ts, exporting `proxy()` not `middleware()` -- see AGENTS.md.)
const PUBLIC_PATHS = ["/", "/login", "/auth", "/about", "/guidelines"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

export async function proxy(request: NextRequest) {
  // Captured (not applied to a response) during getUser()'s cookie refresh,
  // then re-applied once at the end alongside the user-id header below --
  // see the comment further down for why this is one response, not two.
  let cookiesToSetList: { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSetList = cookiesToSet;
        },
      },
    }
  );

  // Required -- this call both validates the session and refreshes the
  // cookie if it's close to expiring. Skipping it silently breaks sessions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Forward the already-validated user id to Server Components via a request
  // header. AppShell (root layout, wraps every page) used to call
  // supabase.auth.getUser() a second time just to re-derive who's signed in
  // -- a fully redundant network round-trip to Supabase Auth on every single
  // page load, since proxy() already did this exact check. Reading the
  // header instead is free.
  if (user) {
    request.headers.set("x-kmate-user-id", user.id);
  }

  const response = NextResponse.next({ request });
  cookiesToSetList.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
