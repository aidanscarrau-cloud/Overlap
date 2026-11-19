import type { Metadata } from "next";
import { TrialsPage } from "@/components/app/trials/Trials";
export const metadata: Metadata = { title: "Trials" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <TrialsPage initial={sp.t} />;
}
