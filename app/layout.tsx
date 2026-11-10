import type { Metadata, Viewport } from "next";
import { Big_Shoulders, DM_Sans } from "next/font/google";
import { SPRITE } from "@/components/sprite";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

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
