import { NextResponse, type NextRequest } from "next/server";

const MEDIAPIPE_CDN_ORIGIN = "https://cdn.jsdelivr.net";
const MEDIAPIPE_MODELS_ORIGIN = "https://storage.googleapis.com";
const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";

function buildCsp(isDev: boolean) {
  return [
    `default-src 'self'`,
    // This standalone surface is entirely client-driven. Avoid a nonce/strict-dynamic
    // policy here because a nonce mismatch can leave the server-rendered controls
    // visible while preventing Next.js hydration, making every selector look static.
    `script-src 'self' 'unsafe-inline' ${MEDIAPIPE_CDN_ORIGIN}${isDev ? " 'unsafe-eval'" : " 'wasm-unsafe-eval'"}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self' ${MEDIAPIPE_CDN_ORIGIN} ${MEDIAPIPE_MODELS_ORIGIN} ${GEMINI_API_ORIGIN}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // This branch is a standalone Research Interview deployment. Keep the old
  // KMate application routes out of the visible surface even though they are
  // still present in repository history.
  if (pathname !== "/" && pathname !== "/api/research-interview/session") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const csp = buildCsp(process.env.NODE_ENV === "development");
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
