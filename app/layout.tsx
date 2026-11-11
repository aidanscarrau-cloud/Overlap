import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SPRITE } from "@/components/sprite";
import "./globals.css";

// Geist + Geist Mono (coaches' "pro" look) and Onest (families' "calm" look); SIL Open Font License, self-hosted.
const geist = localFont({ src: "./fonts/Geist-latin.woff2", weight: "100 900", variable: "--font-geist", display: "swap" });
const mono = localFont({ src: "./fonts/GeistMono-latin.woff2", weight: "100 900", variable: "--font-mono", display: "swap" });
const onest = localFont({ src: "./fonts/Onest-latin.woff2", weight: "100 900", variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Overlap", template: "%s · Overlap" },
  description: "Plan training, manage squads and run your football club.",
  // Home-screen icon and name on iPhones (Android reads the manifest).
  appleWebApp: { capable: true, title: "Overlap", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable} ${onest.variable}`}>
      <body>
        <div dangerouslySetInnerHTML={{ __html: SPRITE }} style={{ display: "contents" }} />
        {children}
      </body>
    </html>
  );
}
