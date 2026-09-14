import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archery TMS",
  description: "Tournament management for target archery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
