import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { PlayerIdp } from "@/components/app/idp/PlayerIdp";
export const metadata: Metadata = { title: "Development plan" };
export default async function Page({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return (
    <ProGate feature="Player development" blurb="Ratings, goals and progress families can see.">
      <PlayerIdp playerId={playerId} />
    </ProGate>
  );
}
