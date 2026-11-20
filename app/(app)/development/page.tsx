import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { DevelopmentHome } from "@/components/app/idp/Development";
export const metadata: Metadata = { title: "Development" };
export default function Page() {
  return (
    <ProGate feature="Player development" blurb="Ratings, goals and progress families can see.">
      <DevelopmentHome />
    </ProGate>
  );
}
