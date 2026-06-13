import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/logo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Distinctive optical serif for display.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "OneTimePic: send a photo that opens once",
    template: "%s · OneTimePic",
  },
  description:
    "Send a photo through a link that opens once, then deletes itself. No account. Encrypted on your device.",
  applicationName: "OneTimePic",
  openGraph: {
    title: "OneTimePic: send a photo that opens once",
    description: "A link that opens a photo once, then deletes it.",
    siteName: "OneTimePic",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="atmosphere" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />

        <header className="w-full">
          <div className="mx-auto max-w-xl px-6 py-6">
            <Link
              href="/"
              className="inline-block rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-ember focus-visible:outline-offset-4"
              aria-label="OneTimePic home"
            >
              <Logo />
            </Link>
          </div>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>

        <footer className="w-full">
          <div className="mx-auto max-w-xl px-6 py-10">
            <p className="text-center text-xs leading-relaxed text-faint">
              Your photo is encrypted on your device and deleted after one view.
              Screenshots can't be fully blocked, so only share with people you
              trust.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
