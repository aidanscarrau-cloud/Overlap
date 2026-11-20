import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { Drills } from "@/components/app/views/Drills";
export const metadata: Metadata = { title: "Drill library" };
export default function Page() {
  return (
    <ProGate feature="The drill library and session planner" blurb="Animated drills by age and theme, and a session planner that builds a session in minutes.">
      <Drills />
    </ProGate>
  );
}
