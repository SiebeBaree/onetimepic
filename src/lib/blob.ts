// Server-side Vercel Blob access. Reads BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID
// from the environment automatically.
//
// The store is PRIVATE: ciphertext is never publicly fetchable — only this
// server (holding the token) can read it via get(). We store NO separate
// metadata: the existence of a blob *is* the "not yet viewed" flag. Viewing
// reads then deletes it (burn); a second read returns null -> the link is
// spent. The link id maps 1:1 to the blob pathname.

import { del, get, list, put } from "@vercel/blob";
import { BLOB_PREFIX } from "./config";

function pathFor(id: string): string {
  return `${BLOB_PREFIX}${id}`;
}

export async function putCiphertext(
  id: string,
  data: ArrayBuffer,
): Promise<void> {
  await put(pathFor(id), data, {
    access: "private", // only the server can read it; doubly safe with E2E
    addRandomSuffix: false, // deterministic path so the view route can find it
    allowOverwrite: false,
    contentType: "application/octet-stream",
    cacheControlMaxAge: 0, // never cache a one-time payload
  });
}

/**
 * "Burn": read the private ciphertext, then delete it. Returns null if the blob
 * no longer exists (already viewed or expired).
 *
 * NOTE: there is a small race window between read and delete. Two simultaneous
 * opens of the same secret link could both succeed. For a bearer-token secret
 * link this is low-risk; closing it fully requires an atomic store (Redis) and
 * is a documented v1 limitation.
 */
export async function takeCiphertext(id: string): Promise<ArrayBuffer | null> {
  const path = pathFor(id);

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(path, { access: "private", useCache: false });
  } catch {
    return null;
  }
  if (!result || result.statusCode !== 200) {
    await del(path).catch(() => {});
    return null;
  }

  const buffer = await new Response(result.stream).arrayBuffer();
  await del(path).catch(() => {}); // burn
  return buffer;
}

/** Delete never-opened blobs older than maxAgeMs. Returns the count removed. */
export async function sweepExpired(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    const stale = page.blobs
      .filter((b) => new Date(b.uploadedAt).getTime() < cutoff)
      .map((b) => b.pathname);
    if (stale.length > 0) {
      await del(stale);
      removed += stale.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return removed;
}
