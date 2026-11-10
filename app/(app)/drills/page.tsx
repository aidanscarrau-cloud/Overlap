import type { Metadata } from "next";
import { Drills } from "@/components/app/views/Drills";
export const metadata: Metadata = { title: "Drill library" };
export default function Page() {
  return <Drills />;
}
