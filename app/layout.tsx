import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SPRITE } from "@/components/sprite";
import "./globals.css";

// Funnel Display + Funnel Sans (SIL Open Font License), self-hosted variable fonts, Latin subset.
const display = localFont({ src: "./fonts/FunnelDisplay-latin.woff2", weight: "300 800", variable: "--font-display", display: "swap" });
const body = localFont({ src: "./fonts/FunnelSans-latin.woff2", weight: "300 800", variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Overlap", template: "%s · Overlap" },
  description: "Plan training, manage squads and run your football club.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div dangerouslySetInnerHTML={{ __html: SPRITE }} style={{ display: "contents" }} />
        {children}
      </body>
    </html>
  );
}
