import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "./app-shell";

export const metadata: Metadata = {
  title: "Reelkar",
  description: "Make reels, cartoons and short films with AI.",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff7ee" },
    { media: "(prefers-color-scheme: dark)", color: "#150a1a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- the app fonts, loaded at runtime so builds work offline */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Inter:wght@400;500;600;700;800&family=Hind:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
