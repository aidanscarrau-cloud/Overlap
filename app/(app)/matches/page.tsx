import type { Metadata } from "next";
import { Matches } from "@/components/app/matches/Matches";
export const metadata: Metadata = { title: "Matches" };
export default function Page() {
  return <Matches />;
}
