import type { NextRequest } from "next/server";

// `request.ip` / `request.geo` were removed in Next.js 15. On Vercel the real
// client IP is the first entry of `x-forwarded-for` (set by the edge proxy);
// the raw socket address would be Vercel's own infrastructure.
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "0.0.0.0";
}
