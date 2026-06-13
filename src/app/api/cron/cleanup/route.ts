import { type NextRequest, NextResponse } from "next/server";
import { sweepExpired } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invoked by Vercel Cron (see vercel.json). Vercel attaches
// `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET is set.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Refuse to run unauthenticated in production.
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const removed = await sweepExpired();
    return NextResponse.json({ removed });
  } catch (error) {
    console.error("[cron] cleanup failed", error);
    return new NextResponse("Cleanup failed", { status: 500 });
  }
}
