import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { InsightsPage } from "@/components/app/insights/Insights";
export const metadata: Metadata = { title: "Insights" };
export default function Page() {
  return (
    <ProGate feature="Coach insights" blurb="Attendance trends, who is dropping off, replies and minutes played.">
      <InsightsPage />
    </ProGate>
  );
}
