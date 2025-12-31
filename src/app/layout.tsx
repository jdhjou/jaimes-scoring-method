import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jaime’s Scoring Method",
  description: "A smarter way to track scoring, strokes lost, and improvement in golf.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
