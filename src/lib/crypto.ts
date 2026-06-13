// Client-side end-to-end encryption.
//
// The image is encrypted in the browser with AES-GCM. The raw key is returned
// as a base64url string that the caller places in the URL *fragment* (#...),
// which browsers never send to the server. The server therefore only ever
// stores opaque ciphertext and can never decrypt it.
//
// Wire format of the stored payload:  [ IV (12 bytes) | AES-GCM ciphertext ]
// Plaintext (before encryption):      [ format (1 byte) | flags (1 byte) | image bytes ]
//   flags bit 0 = include watermark

import { fromBase64Url, toBase64Url } from "./ids";

export const FORMAT_WEBP = 0;
export const FORMAT_JPEG = 1;

const IV_BYTES = 12;

export type EncryptResult = {
  payload: Uint8Array<ArrayBuffer>;
  keyB64: string;
};

export async function encryptImage(
  imageBytes: ArrayBuffer,
  format: number,
  watermark: boolean,
): Promise<EncryptResult> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const plaintext = new Uint8Array(2 + imageBytes.byteLength);
  plaintext[0] = format;
  plaintext[1] = watermark ? 1 : 0;
  plaintext.set(new Uint8Array(imageBytes), 2);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  const payload = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(ciphertext, IV_BYTES);

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { payload, keyB64: toBase64Url(rawKey) };
}

export async function decryptImage(
  payload: ArrayBuffer,
  keyB64: string,
): Promise<{ blob: Blob; watermark: boolean }> {
  const bytes = new Uint8Array(payload);
  if (bytes.byteLength <= IV_BYTES) throw new Error("Payload too short");

  const iv = bytes.subarray(0, IV_BYTES);
  const ciphertext = bytes.subarray(IV_BYTES);

  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(keyB64),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext),
  );

  const format = plaintext[0];
  const watermark = plaintext[1] === 1;
  const imageBytes = plaintext.subarray(2);
  const mime = format === FORMAT_JPEG ? "image/jpeg" : "image/webp";
  // Copy into a fresh buffer so the Blob doesn't retain the whole plaintext view.
  return { blob: new Blob([imageBytes.slice()], { type: mime }), watermark };
}
