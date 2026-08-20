import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LiquidRuntime } from "@/components/liquid";
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
  themeColor: "#05050c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LiquidRuntime />
        <div className="aurora" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {/* No nav bar: this app has nothing to navigate. Identity sits
            quietly on the canvas. */}
        <header className="flex justify-center pt-9">
          <Link
            href="/"
            aria-label="OneTimePic home"
            className="rounded-lg opacity-80 outline-none transition-opacity duration-300 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-glacier focus-visible:outline-offset-4"
          >
            <Logo />
          </Link>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>

        <footer className="w-full">
          <div className="mx-auto max-w-md px-6 py-10">
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
