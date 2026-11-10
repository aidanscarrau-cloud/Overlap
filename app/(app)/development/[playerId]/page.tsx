import type { Metadata } from "next";
import { PlayerIdp } from "@/components/app/idp/PlayerIdp";
export const metadata: Metadata = { title: "Development plan" };
export default async function Page({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return <PlayerIdp playerId={playerId} />;
}
