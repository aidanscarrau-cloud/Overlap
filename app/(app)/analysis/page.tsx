import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { AnalysisPage } from "@/components/app/analysis/Analysis";
export const metadata: Metadata = { title: "Analysis" };
export default function Page() {
  return (
    <ProGate feature="Match analysis" blurb="Tag match video, build clip playlists, keep a set-piece library and write opposition scouting reports. For coaching staff only.">
      <AnalysisPage />
    </ProGate>
  );
}
