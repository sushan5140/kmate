import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildLoginUrl, destinationFrom } from "@/lib/auth/safe-next";

// Unlike a typical "protect one section" setup, almost everything in GKS
// Connect requires auth -- the matcher below runs on every request except
// the public marketing/legal/auth surface, and this function redirects
// signed-out visitors to /login. (Next.js 16 renamed middleware.ts ->
// proxy.ts, exporting `proxy()` not `middleware()` -- see AGENTS.md.)
// "/api/cron" is public *to the proxy* only -- it has no user session to
// check (Vercel Cron calls it unauthenticated), so redirecting it to /login
// would break the schedule. The route itself is guarded by a
// CRON_SECRET bearer token / admin check and fails closed -- see
// app/api/cron/notices/route.ts.
const PUBLIC_PATHS = ["/", "/login", "/auth", "/about", "/guidelines", "/api/cron"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

// The browser Supabase client (lib/supabase/browser-client.ts) calls Supabase
// Auth directly for sign-in/sign-out, so connect-src must allow that origin
// alongside 'self'.
const SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;

// Chat's realtime subscriptions open a WebSocket to the same host over wss://.
// CSP matches scheme-qualified sources exactly, so the https:// origin above
// does NOT cover wss:// -- without this the socket is blocked and the channel
// fails with a bare "transport failure", while every ordinary HTTP query keeps
// working, which makes it look like a subscription bug rather than a CSP one.
const SUPABASE_WS_ORIGIN = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

// Nonce-based CSP per https://nextjs.org/docs/app/guides/content-security-policy
// -- chosen over `script-src 'unsafe-inline'` because it costs nothing here:
// every route in this app already reads headers()/cookies() in AppShell, so
// the whole app is dynamically rendered already (confirmed via `next build`),
// meaning the "all pages must be dynamic" requirement for nonces is already
// true regardless of this change.
//
// style-src stays on 'unsafe-inline' (not nonce'd) in every environment --
// confirmed via a real browser CSP check that framer-motion writes
// `element.style.cssText` directly for its animations, which CSP always
// treats as an inline-style mutation with no way to attach a nonce to it.
// A nonce'd style-src silently broke the onboarding wizard's step
// transitions and the admin pages' action menus. Inline-style injection is
// a materially lower-severity class than script injection, so this trades
// away a secondary protection to keep the primary one (script-src) strict.
// AI Mock Interview loads MediaPipe Tasks Vision from jsDelivr at runtime
// (see lib/mock-interview/mediapipe.ts) and fetches its WASM runtime + model
// files from storage.googleapis.com -- both need an explicit connect-src
// allowance, since MediaPipe isn't a bundled dependency the default 'self'
// origin would cover. Its WASM runtime also needs 'wasm-unsafe-eval' to
// instantiate at all in production (dev already has the broader
// 'unsafe-eval'). Scoped to exactly this path rather than loosened
// app-wide, same reasoning as the Permissions-Policy exception in
// next.config.ts.
// Stage 3 adds the Gemini API-key-validation call (and Stage 4 will add the
// end-of-interview feedback call) -- both are plain client-side fetch()
// calls straight to Google's Generative Language API (BYOK: the user's own
// key, never proxied through KMate's backend), so this origin needs the
// same connect-src allowance as the MediaPipe origins above.
const MOCK_INTERVIEW_PATH = "/interview-db/mock-interview";
const MEDIAPIPE_CDN_ORIGIN = "https://cdn.jsdelivr.net";
const MEDIAPIPE_MODELS_ORIGIN = "https://storage.googleapis.com";
const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";

function buildCsp(nonce: string, isDev: boolean, pathname: string) {
  const isMockInterview = pathname === MOCK_INTERVIEW_PATH;
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : isMockInterview ? " 'wasm-unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN}${isMockInterview ? ` ${MEDIAPIPE_CDN_ORIGIN} ${MEDIAPIPE_MODELS_ORIGIN} ${GEMINI_API_ORIGIN}` : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Unconditionally strip any client-supplied value for this header before
  // anything else runs. AppShell trusts this header as "the verified signed-
  // in user" -- if we only ever *set* it (inside `if (user)` below) and never
  // clear it, a request with no session at all could arrive with its own
  // x-kmate-user-id header already attached and have that spoofed value pass
  // straight through untouched to Server Components on every public path.
  request.headers.delete("x-kmate-user-id");
  // Same spoofing risk, same fix -- requireAdmin()/isAuthorizedAdmin() (see
  // lib/supabase/auth-server.ts) gate every admin route on this header
  // matching ADMIN_EMAIL, so it must never be client-settable.
  request.headers.delete("x-kmate-user-email");
  // Same reasoning: requireOnboarded() below trusts this as "the URL actually
  // requested", so a client-supplied value must never survive.
  request.headers.delete("x-kmate-url");

  // Generated fresh per-request -- Next.js reads this off the CSP header (on
  // the request, for rendering; on the response, for the browser) and
  // automatically tags its own framework/page scripts with it.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp(nonce, isDev, request.nextUrl.pathname);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

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

  // The full destination -- pathname AND query string. Previously only the
  // pathname was carried, so /notices?view=gks&program=... came back as bare
  // /notices after sign-in and every filter was lost.
  //
  // One thing this does NOT control: Next.js normalises the query string
  // before any proxy code runs, regrouping repeated keys
  // (uni=A&maj=1&uni=B&maj=2 arrives as uni=A&uni=B&maj=1&maj=2). Nothing is
  // dropped and the order WITHIN each key is kept, which is what matters --
  // /application-readiness pairs uni with maj by index via asArray(), so the
  // pairing survives intact. request.url is normalised identically, so there
  // is no rawer source to read from here.
  const destination = destinationFrom(request.nextUrl);

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    // Built from the origin rather than by cloning nextUrl: cloning kept the
    // ORIGINAL query parameters on the login URL, so they arrived as siblings
    // of `next` (`/login?view=gks&program=...&next=%2Fnotices`) rather than
    // inside it. buildLoginUrl percent-encodes the whole destination once.
    return NextResponse.redirect(new URL(buildLoginUrl(destination), request.nextUrl.origin));
  }

  // Forward the already-validated user id to Server Components via a request
  // header. AppShell (root layout, wraps every page) used to call
  // supabase.auth.getUser() a second time just to re-derive who's signed in
  // -- a fully redundant network round-trip to Supabase Auth on every single
  // page load, since proxy() already did this exact check. Reading the
  // header instead is free.
  if (user) {
    request.headers.set("x-kmate-user-id", user.id);
    if (user.email) request.headers.set("x-kmate-user-email", user.email);
  }

  // Server Components never see the request URL, so a page-level guard such as
  // requireOnboarded() cannot know its own query string -- which is why every
  // call site passes a hardcoded literal like "/notices". Forwarding the real
  // destination here lets that one shared guard preserve the query for EVERY
  // gated route, with no per-page change.
  request.headers.set("x-kmate-url", destination);

  const response = NextResponse.next({ request });
  cookiesToSetList.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
