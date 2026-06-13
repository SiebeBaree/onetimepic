// URL-safe id + base64url helpers. Runs in both the browser and Node 20+
// (both expose Web Crypto's `crypto.getRandomValues` and `btoa`/`atob`).

const ID_BYTES = 16; // 128 bits of entropy -> unguessable link ids

export function newId(): string {
  const bytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Return type is pinned to an ArrayBuffer-backed view (TS 5.7+ made typed
// arrays generic; Web Crypto's BufferSource requires `Uint8Array<ArrayBuffer>`).
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
