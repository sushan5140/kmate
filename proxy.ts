import { NextResponse, type NextRequest } from "next/server";

const MEDIAPIPE_CDN_ORIGIN = "https://cdn.jsdelivr.net";
const MEDIAPIPE_MODELS_ORIGIN = "https://storage.googleapis.com";
const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";

function buildCsp(nonce: string, isDev: boolean) {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : " 'wasm-unsafe-eval'"}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self' ${MEDIAPIPE_CDN_ORIGIN} ${MEDIAPIPE_MODELS_ORIGIN} ${GEMINI_API_ORIGIN}`,
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

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
