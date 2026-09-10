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

const interviewMediaHeaders = [
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Camera/mic stay denied app-wide. Only the two interview experiences
      // receive a self-only exception for getUserMedia.
      {
        source: "/interview-db/mock-interview",
        headers: interviewMediaHeaders,
      },
      {
        source: "/interview-db/research-interview",
        headers: interviewMediaHeaders,
      },
    ];
  },
};

export default nextConfig;
