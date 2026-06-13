# OneTimePic

Share a photo through a single-use, **end-to-end encrypted** link. It opens
one time, then it's deleted for good. No account, encrypted in the browser.

Built on Next.js 16 (App Router) + Vercel Blob, with optional Upstash Redis for
abuse limits.

## How it works

```
sender's browser                     server (Vercel)              recipient's browser
────────────────                     ───────────────              ──────────────────
downscale + strip EXIF
re-encode (WebP/JPEG)
AES-GCM encrypt  ── ciphertext ──▶   store in PRIVATE Blob
key stays local                      (server can't decrypt)
build link /v/<id>#<key>.<secs>
        │
        └──────────── share link (key is in the #fragment) ──────────▶ open link
                                     POST /api/i/<id>  ◀───────────────  tap "Reveal"
                                     read blob, then DELETE it (burn)
                     ciphertext ─────────────────────────────────────▶ AES-GCM decrypt
                                                                        render to <canvas>
                                                                        + countdown (+ watermark)
```

- **End-to-end encrypted.** The image is encrypted in the browser with AES-GCM.
  The key is placed in the URL **fragment** (`#…`), which browsers never send to
  the server. The server only ever stores opaque ciphertext in a **private**
  Blob store and cannot decrypt it.
- **One-time / burn.** The recipient fetches through `POST /api/i/<id>`, which
  reads the blob and immediately deletes it. A second open returns `410 Gone`.
  The burn is triggered by an explicit "Reveal" tap, not on page load, so
  link-preview crawlers can't consume it.
- **Auto-expiry.** Never-opened uploads are swept after 24h by a Vercel Cron
  (`/api/cron/cleanup`, see `vercel.json`).
- **Privacy hygiene.** Re-encoding through a canvas strips EXIF/GPS. Security
  headers (`Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, CSP) are set
  in `next.config.ts`.
- **Capture deterrents (not prevention).** Blur on tab-hide, PrintScreen
  detection, an optional per-photo watermark the sender turns on or off, and a
  disabled context menu. These raise friction but **cannot truly stop** a
  screenshot or a second camera, and the UI says so plainly. The watermark choice
  travels inside the encrypted payload, so the viewer can't flip it.

## Abuse protection

| Layer | Mechanism | Needs Redis? |
| --- | --- | --- |
| File size | ≤ ~4 MB ciphertext, enforced server-side + browser re-encode | No |
| Per-browser/day | base64 cookie counter (3/day), soft and easily bypassed | No |
| **Per-IP/day** | `@upstash/ratelimit` fixed window (3/day) | **Yes** |
| **Global/hour** | global ceiling (anti-DDoS / proxy rotation) | **Yes** |

The hard limits use the real client IP from `x-forwarded-for` (Vercel edge).
Tune the numbers in `src/lib/config.ts`.

## Environment variables

Copy `.env.example`. Required vs optional:

```bash
# Required. From the Vercel Blob store (PRIVATE access) connected to the project.
BLOB_READ_WRITE_TOKEN=
BLOB_STORE_ID=

# Recommended. Turns ON the hard per-IP + global rate limits.
# Free, no credit card: https://upstash.com  (or Vercel Marketplace, Upstash).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Recommended in production. Vercel Cron sends this as a Bearer token.
CRON_SECRET=
```

Without the Upstash vars the app still runs; only the file-size cap and cookie
soft-limit are active (a startup warning is logged).

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # biome
pnpm build        # production build
```

## Deploy (Vercel)

1. Connect a **Blob store** (private access). It injects `BLOB_READ_WRITE_TOKEN`
   and `BLOB_STORE_ID`.
2. Add the Upstash + `CRON_SECRET` env vars (above).
3. Deploy. The cron in `vercel.json` runs `/api/cron/cleanup` hourly (adjust the
   schedule to your plan's limits).

## Known limitations

- **Burn race window.** The read-then-delete in `src/lib/blob.ts` is not atomic;
  two simultaneous opens of the same secret link could both succeed. Low risk for
  a bearer-token link. Closing it fully means moving the "consumed" flag to an
  atomic store (Redis `GETDEL`).
- **Screenshots can't be prevented**, only deterred (see above).
- **Anonymous + E2E + ephemeral** means content can't be scanned for abuse. Weigh
  this before running publicly.

## Stack

Next.js 16 · React 19 · Tailwind v4 · Biome · `@vercel/blob` · `@upstash/ratelimit`
· `qrcode` · Web Crypto (AES-GCM). Display type: Fraunces; body: Geist.
