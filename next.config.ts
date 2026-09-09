import type { NextConfig } from "next";

import { version } from "./package.json";

// The map needs OpenStreetMap tiles and its own inline styles/scripts
// (Next.js hydration, Tailwind); nothing else is loaded from the network.
// Dev-only additions: Turbopack/React's dev-mode debugging uses eval(), and
// the HMR client needs a websocket back to the dev server — neither applies
// to a production build, so both are kept out of the deployed policy.
const isDev = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  `connect-src 'self'${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "font-src 'self' data:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    // Only takes effect over HTTPS; harmless on plain HTTP deployments.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

// Where the Rust API service listens. It is reached only through the rewrites
// below, so the browser still talks to a single origin: no CORS, and the
// session cookie stays where it was set. Loopback by default — the port a
// browser reaches is this one, not the API's.
const apiOrigin = process.env.FIELDMANAGER_API_ORIGIN || "http://127.0.0.1:8080";

// Paths served by the Rust service rather than by a route handler in
// `src/app/api`. This list grows one slice at a time (see
// RUST-BACKEND-PLAN.md); a path that is not named here is still TypeScript's.
//
// A rewrite returned as a plain array is checked *after* filesystem routes, so
// a path only reaches the Rust service once its `src/app/api/.../route.ts` is
// gone. Adding a path here and leaving the handler in place would silently
// change nothing.
const rustApiPaths = ["/api/health", "/api/weather"];

const nextConfig: NextConfig = {
  // The about dialog shows the version, and package.json is where it is
  // actually set. Inlining it at build time keeps the number in one place
  // rather than in two that drift apart across a release.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  reactCompiler: true,
  devIndicators: false,
  async rewrites() {
    return rustApiPaths.map((path) => ({
      source: path,
      destination: `${apiOrigin}${path}`,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

