import type { NextConfig } from "next";
import { withBotId } from 'botid/next/config';

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ant/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ant/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ant/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withBotId(nextConfig);
