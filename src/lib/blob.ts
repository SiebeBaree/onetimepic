// Server-side Vercel Blob access. Reads BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID
// from the environment automatically.
//
// The store is PRIVATE: ciphertext is never publicly fetchable — only this
// server (holding the token) can read it via get(). We store NO separate
// metadata: each blob's pathname is `p/<id>.<deadlineMs>`, where deadlineMs is
// the absolute time the link expires if no one opens it. The blob's existence is
// the "not yet viewed" flag; viewing reads then deletes it (burn). Expiry is
// enforced at read time (precise, independent of the cron) and the cron sweeps
// expired blobs for storage hygiene.

import { del, get, list, put } from "@vercel/blob";
import { BLOB_PREFIX, MAX_EXPIRY_MS } from "./config";

function prefixFor(id: string): string {
  return `${BLOB_PREFIX}${id}.`;
}

// Pathname is `p/<id>.<deadlineMs>`; the id is base64url (no dots), so the part
// after the last dot is the deadline.
function parseDeadline(pathname: string): number | null {
  const dot = pathname.lastIndexOf(".");
  if (dot < 0) return null;
  const ms = Number(pathname.slice(dot + 1));
  return Number.isFinite(ms) ? ms : null;
}

export async function putCiphertext(
  id: string,
  data: ArrayBuffer,
  expiryMs: number,
): Promise<void> {
  const deadline = Date.now() + expiryMs;
  await put(`${BLOB_PREFIX}${id}.${deadline}`, data, {
    access: "private", // only the server can read it; doubly safe with E2E
    addRandomSuffix: false, // deterministic prefix so the view route can find it
    allowOverwrite: false,
    contentType: "application/octet-stream",
    cacheControlMaxAge: 0, // never cache a one-time payload
  });
}

/**
 * "Burn": read the private ciphertext, then delete it. Returns null if the blob
 * no longer exists (already viewed) or its availability window has passed.
 *
 * NOTE: there is a small race window between read and delete. Two simultaneous
 * opens of the same secret link could both succeed. For a bearer-token secret
 * link this is low-risk; closing it fully requires an atomic store (Redis).
 */
export async function takeCiphertext(id: string): Promise<ArrayBuffer | null> {
  const prefix = prefixFor(id);
  const { blobs } = await list({ prefix, limit: 1 });
  const blob = blobs.find((b) => b.pathname.startsWith(prefix));
  if (!blob) return null;

  // Enforce expiry at read time, regardless of when the cron last ran.
  const deadline = parseDeadline(blob.pathname);
  if (deadline !== null && Date.now() > deadline) {
    await del(blob.pathname).catch(() => {});
    return null;
  }

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(blob.pathname, { access: "private", useCache: false });
  } catch {
    return null;
  }
  if (!result || result.statusCode !== 200) {
    await del(blob.pathname).catch(() => {});
    return null;
  }

  const buffer = await new Response(result.stream).arrayBuffer();
  await del(blob.pathname).catch(() => {}); // burn
  return buffer;
}

/** Delete blobs whose availability window has passed. Returns the count removed. */
export async function sweepExpired(): Promise<number> {
  const now = Date.now();
  let removed = 0;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    const stale = page.blobs
      .filter((b) => {
        const deadline = parseDeadline(b.pathname);
        if (deadline !== null) return now > deadline;
        // Fallback for any blob without a parseable deadline.
        return now - new Date(b.uploadedAt).getTime() > MAX_EXPIRY_MS;
      })
      .map((b) => b.pathname);
    if (stale.length > 0) {
      await del(stale);
      removed += stale.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return removed;
}
