import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { FitnessPage } from "@/components/app/fitness/Fitness";
export const metadata: Metadata = { title: "Fitness" };
export default function Page() {
  return (
    <ProGate feature="Fitness testing" blurb="Sprint, agility and endurance tests with progress for every player.">
      <FitnessPage />
    </ProGate>
  );
}
