import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// CSP lives in proxy.ts, not here -- it needs a fresh per-request nonce (see
// the Next.js CSP guide), which next.config.ts can't generate.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // AI Mock Interview needs real getUserMedia access -- the blanket
      // camera=()/microphone=() above blocks it app-wide by default. Scope
      // the exception to exactly this route (self only, not any origin)
      // rather than loosening the global policy. Next.js applies a later
      // matching entry's same-key header over an earlier one for the same
      // path, so this must come after the blanket rule above.
      {
        source: "/interview-db/mock-interview",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
