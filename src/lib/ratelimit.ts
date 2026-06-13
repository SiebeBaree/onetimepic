import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RATE_LIMIT } from "./config";

export type LimitResult = {
  ok: boolean;
  reason?: "ip" | "global";
  retryAfterSeconds?: number;
};

let perIp: Ratelimit | null = null;
let global: Ratelimit | null = null;
let initialized = false;

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

function init(): void {
  if (initialized) return;
  initialized = true;

  if (!isRedisConfigured()) {
    console.warn(
      "[ratelimit] Upstash not configured. Hard rate limits are DISABLED. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable them.",
    );
    return;
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  });

  perIp = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(RATE_LIMIT.perIpPerDay, "1 d"),
    prefix: "otp:ip",
    analytics: false,
  });
  global = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(RATE_LIMIT.globalPerHour, "1 h"),
    prefix: "otp:global",
    analytics: false,
  });
}

const retryIn = (reset: number): number =>
  Math.max(1, Math.ceil((reset - Date.now()) / 1000));

export async function checkUploadLimits(ip: string): Promise<LimitResult> {
  init();
  if (!perIp || !global) return { ok: true }; // degraded (no Redis)

  // Per-IP first so an abusive client doesn't consume the global budget.
  const byIp = await perIp.limit(ip);
  if (!byIp.success) {
    return { ok: false, reason: "ip", retryAfterSeconds: retryIn(byIp.reset) };
  }

  const byGlobal = await global.limit("all");
  if (!byGlobal.success) {
    return {
      ok: false,
      reason: "global",
      retryAfterSeconds: retryIn(byGlobal.reset),
    };
  }

  return { ok: true };
}
