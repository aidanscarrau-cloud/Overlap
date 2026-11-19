import type { Metadata } from "next";
import { InsightsPage } from "@/components/app/insights/Insights";
export const metadata: Metadata = { title: "Insights" };
export default function Page() {
  return <InsightsPage />;
}
