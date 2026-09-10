import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildLoginUrl, destinationFrom } from "@/lib/auth/safe-next";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/about", "/guidelines", "/api/cron"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

const SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
const SUPABASE_WS_ORIGIN = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

// Both interview experiences use the same browser-only MediaPipe runtime and
// direct Gemini BYOK calls. Research Interview additionally loads its PPTX
// renderer from jsDelivr; strict-dynamic trusts that runtime import in the
// same scoped CSP used for MediaPipe. No other route gets WASM eval or these
// external connect-src allowances.
const INTERVIEW_TOOL_PATHS = new Set([
  "/interview-db/mock-interview",
  "/interview-db/research-interview",
]);
const MEDIAPIPE_CDN_ORIGIN = "https://cdn.jsdelivr.net";
const MEDIAPIPE_MODELS_ORIGIN = "https://storage.googleapis.com";
const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";

function buildCsp(nonce: string, isDev: boolean, pathname: string) {
  const isInterviewTool = INTERVIEW_TOOL_PATHS.has(pathname);
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : isInterviewTool ? " 'wasm-unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN}${isInterviewTool ? ` ${MEDIAPIPE_CDN_ORIGIN} ${MEDIAPIPE_MODELS_ORIGIN} ${GEMINI_API_ORIGIN}` : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Strip user-controllable copies before trusted values are attached below.
  request.headers.delete("x-kmate-user-id");
  request.headers.delete("x-kmate-user-email");
  request.headers.delete("x-kmate-url");

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp(nonce, isDev, request.nextUrl.pathname);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  let cookiesToSetList: {
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }[] = [];

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const destination = destinationFrom(request.nextUrl);

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(buildLoginUrl(destination), request.nextUrl.origin));
  }

  if (user) {
    request.headers.set("x-kmate-user-id", user.id);
    if (user.email) request.headers.set("x-kmate-user-email", user.email);
  }
  request.headers.set("x-kmate-url", destination);

  const response = NextResponse.next({ request });
  cookiesToSetList.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
