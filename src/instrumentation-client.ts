// Client-side instrumentation: initialize PostHog before hydration.
// Runs only in the browser (Next.js instrumentation-client convention).

import type { CaptureResult } from "posthog-js";
import posthog from "posthog-js";
import { initBotId } from 'botid/client/core';

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

function looksLikeUrl(value: string): boolean {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/")
  );
}

function sanitizeUrl(value: string): string {
  const hash = value.indexOf("#");
  const withoutFragment = hash >= 0 ? value.slice(0, hash) : value;
  return withoutFragment.replace(/\/v\/[^/?#\s]+/g, "/v/[id]");
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    return looksLikeUrl(value) ? sanitizeUrl(value) : value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = sanitize(record[key]);
    }
    return record;
  }
  return value;
}

if (token) {
  try {
    posthog.init(token, {
      api_host: "/ant",
      ui_host: "https://eu.posthog.com",
      defaults: "2026-01-30",
      disable_session_recording: true,
      before_send: (event: CaptureResult | null) => {
        if (event?.properties) {
          event.properties = sanitize(
            event.properties,
          ) as CaptureResult["properties"];
        }
        return event;
      },
    });
  } catch (error) {
    console.error("[posthog] init failed", error);
  }
}

initBotId({
  protect: [
    {
      path: '/api/*',
      method: 'POST',
    },
  ],
});