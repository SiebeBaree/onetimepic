// Central configuration for OneTimePic.
// Sizes are tuned so the encrypted payload stays well under Vercel's ~4.5MB
// serverless request-body limit (the browser re-encodes before uploading).

/** Reject source files larger than this before we decode them. */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB

/** Longest edge of the re-encoded image. Keeps payloads small + strips EXIF. */
export const MAX_DIMENSION = 2048;

/** Target size for the browser-side re-encode loop. */
export const ENCODE_TARGET_BYTES = 3_200_000; // ~3.2 MB

/** Hard server-side cap on the ciphertext we will accept/store. */
export const MAX_CIPHERTEXT_BYTES = 4_000_000; // ~4 MB (< Vercel 4.5MB body limit)

/** View-duration choices offered in the UI (seconds). */
export const VIEW_SECONDS_OPTIONS = [5, 10, 30] as const;
export const DEFAULT_VIEW_SECONDS = 10;
export const MIN_VIEW_SECONDS = 3;
export const MAX_VIEW_SECONDS = 60;

// How long the link stays available if no one opens it (the sender chooses).
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const EXPIRY_OPTIONS = [
  { label: "1 hour", ms: HOUR },
  { label: "24 hours", ms: DAY },
  { label: "3 days", ms: 3 * DAY },
  { label: "7 days", ms: 7 * DAY },
] as const;
export const DEFAULT_EXPIRY_MS = DAY;
/** Upper bound + fallback the cleanup cron uses for any blob without a deadline. */
export const MAX_EXPIRY_MS = 7 * DAY;

/** Blob key prefix for stored ciphertext. */
export const BLOB_PREFIX = "p/";

/** Abuse limits (enforced when an Upstash Redis store is configured). */
export const RATE_LIMIT = {
  /** Per-IP uploads allowed per rolling day. */
  perIpPerDay: 3,
  /** Global ceiling across all IPs per hour (anti-DDoS / proxy-rotation guard). */
  globalPerHour: 50,
} as const;

/** Soft per-browser daily counter cookie (works without Redis; bypassable). */
export const SOFT_COOKIE = "otp_u";
