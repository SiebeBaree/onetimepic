import { type NextRequest, NextResponse } from "next/server";
import { putCiphertext } from "@/lib/blob";
import { MAX_CIPHERTEXT_BYTES, RATE_LIMIT, SOFT_COOKIE } from "@/lib/config";
import { newId } from "@/lib/ids";
import { getClientIp } from "@/lib/ip";
import { checkUploadLimits } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_LIMIT_MESSAGE = `Daily limit reached. You can share ${RATE_LIMIT.perIpPerDay} photos per day.`;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Layer 1: hard limits (per-IP/day + global/hour) when Redis is configured.
  const limit = await checkUploadLimits(ip);
  if (!limit.ok) {
    return json429(
      limit.reason === "global"
        ? "OneTimePic is at capacity right now. Please try again shortly."
        : DAILY_LIMIT_MESSAGE,
      limit.retryAfterSeconds,
    );
  }

  // Layer 2: soft per-browser daily counter (always on; bypassable deterrent).
  const used = readSoftCount(request);
  if (used >= RATE_LIMIT.perIpPerDay) {
    return json429(DAILY_LIMIT_MESSAGE);
  }

  // Layer 3: size cap (cheap pre-check, then enforced after reading the body).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_CIPHERTEXT_BYTES) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload." }, { status: 400 });
  }
  if (body.byteLength > MAX_CIPHERTEXT_BYTES) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  const id = newId();
  try {
    await putCiphertext(id, body);
  } catch (error) {
    console.error("[upload] blob put failed", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ id });
  writeSoftCount(response, used + 1);
  return response;
}

function json429(error: string, retryAfterSeconds?: number) {
  return NextResponse.json(
    { error },
    {
      status: 429,
      headers: retryAfterSeconds
        ? { "Retry-After": String(retryAfterSeconds) }
        : undefined,
    },
  );
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function readSoftCount(request: NextRequest): number {
  const raw = request.cookies.get(SOFT_COOKIE)?.value;
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(atob(raw)) as { d?: string; n?: number };
    return parsed.d === todayKey() ? Number(parsed.n) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeSoftCount(response: NextResponse, count: number): void {
  const value = btoa(JSON.stringify({ d: todayKey(), n: count }));
  response.cookies.set(SOFT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}
