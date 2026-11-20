import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SPRITE } from "@/components/sprite";
import { StaleBuildReload } from "@/components/StaleBuildReload";
import "./globals.css";
import "./club-theme.css";

// Barlow (reading text) and Barlow Condensed (sporty headings); SIL Open Font License, self-hosted.
const barlow = localFont({
  src: [
    { path: "./fonts/barlow-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/barlow-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/barlow-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/barlow-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCond = localFont({
  src: [
    { path: "./fonts/barlow-condensed-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/barlow-condensed-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-barlow-cond",
  display: "swap",
});
// Geist + Geist Mono and Onest stay available for older styles while pages move over.
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
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${mono.variable} ${onest.variable} ${barlow.variable} ${barlowCond.variable}`}>
      <head>
        {/* Light, dark or auto, chosen in the menu. Set before the page draws so it never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("overlap-theme");document.documentElement.dataset.theme=t==="dark"||t==="auto"?t:"light"}catch(e){document.documentElement.dataset.theme="light"}` }} />
      </head>
      <body>
        <div dangerouslySetInnerHTML={{ __html: SPRITE }} style={{ display: "contents" }} />
        <StaleBuildReload />
        {children}
      </body>
    </html>
  );
}
