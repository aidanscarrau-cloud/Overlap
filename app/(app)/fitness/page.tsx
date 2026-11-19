import type { Metadata } from "next";
import { FitnessPage } from "@/components/app/fitness/Fitness";
export const metadata: Metadata = { title: "Fitness" };
export default function Page() {
  return <FitnessPage />;
}
