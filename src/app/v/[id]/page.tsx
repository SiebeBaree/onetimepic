import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Viewer } from "@/components/viewer";
import { isValidId } from "@/lib/ids";

// Neutral, content-free metadata: link previews in chat apps render this card
// (and never burn the photo — only the explicit reveal tap does that).
export const metadata: Metadata = {
  title: "A one-time photo",
  description: "Someone sent you a photo that opens once.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "You've been sent a one-time photo",
    description: "It opens a single time, then it's gone. Tap to reveal.",
  },
};

export default async function ViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  return <Viewer id={id} />;
}
