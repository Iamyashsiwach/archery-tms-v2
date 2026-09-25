import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archery TMS",
  description: "Tournament management for target archery",
};

// The WA target face, outside in: white, black, blue, red, gold.
const RINGS = ["#ffffff", "#1f1f1f", "#1d6fd1", "#e03131", "#fcc419"];

function TargetMark() {
  return (
    <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden>
      {RINGS.map((fill, i) => (
        <circle key={fill} cx="10" cy="10" r={10 - i * 2} fill={fill} stroke="#1f1f1f" strokeWidth={i === 0 ? 0.6 : 0} />
      ))}
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <TargetMark />
              Archery TMS
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
