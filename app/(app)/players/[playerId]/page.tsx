import type { Metadata } from "next";
import { Progress } from "@/components/app/views/Progress";
export const metadata: Metadata = { title: "Progress report" };
export default async function Page({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return <Progress playerId={playerId} />;
}
