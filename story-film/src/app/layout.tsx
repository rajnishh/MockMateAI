import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Story to Film",
  description: "Turn a short story into a vertical AI film.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
