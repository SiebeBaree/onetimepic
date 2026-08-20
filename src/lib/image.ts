// Browser-only image normalization: downscale + re-encode.
//
// Re-encoding through a canvas has three benefits:
//  1. Strips all EXIF metadata (incl. GPS) — it is never serialized back out.
//  2. Caps dimensions so the encrypted payload stays under the upload limit.
//  3. Normalizes format to WebP (JPEG fallback) for predictable decoding.

import { ENCODE_TARGET_BYTES, MAX_DIMENSION } from "./config";
import { FORMAT_JPEG, FORMAT_WEBP } from "./crypto";

export type ProcessedImage = {
  data: ArrayBuffer;
  format: number;
  width: number;
  height: number;
};

export async function processImage(file: File): Promise<ProcessedImage> {
  const source = await decode(file);
  const sw = source.width;
  const sh = source.height;
  if (!sw || !sh) throw new Error("Could not read image dimensions");

  let scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh));
  let quality = 0.9;

  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

    let format = FORMAT_WEBP;
    let blob = await encode(canvas, "image/webp", quality);
    if (blob?.type !== "image/webp") {
      format = FORMAT_JPEG;
      blob = await encode(canvas, "image/jpeg", quality);
    }
    if (!blob) throw new Error("Could not encode image");

    if (blob.size <= ENCODE_TARGET_BYTES) {
      release(source);
      return { data: await blob.arrayBuffer(), format, width: w, height: h };
    }

    // Still too big: drop quality first, then dimensions.
    if (quality > 0.6) quality -= 0.12;
    else scale *= 0.85;
  }

  release(source);
  throw new Error("This image is too large to process. Try a smaller one.");
}

type DecodedSource = (ImageBitmap | HTMLImageElement) & {
  width: number;
  height: number;
};

async function decode(file: File): Promise<DecodedSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return (await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions)) as DecodedSource;
    } catch {
      // fall through to <img> decoding
    }
  }
  return loadViaImg(file);
}

function loadViaImg(file: File): Promise<DecodedSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img as DecodedSource);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported or corrupt image"));
    };
    img.src = url;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

async function encode(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas) {
    try {
      return await canvas.convertToBlob({ type, quality });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), type, quality),
  );
}

function release(source: DecodedSource) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}
