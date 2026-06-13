import { type NextRequest, NextResponse } from "next/server";
import { takeCiphertext } from "@/lib/blob";
import { isValidId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST (not GET) so link-preview crawlers and speculative prefetch can never
// trigger the one-time burn. Only the explicit "reveal" tap calls this.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidId(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let payload: ArrayBuffer | null;
  try {
    payload = await takeCiphertext(id);
  } catch (error) {
    console.error("[view] failed", error);
    return new NextResponse("Something went wrong", { status: 500 });
  }

  if (!payload) {
    // Already viewed, expired, or never existed.
    return new NextResponse("Gone", { status: 410 });
  }

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
