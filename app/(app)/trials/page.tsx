import type { Metadata } from "next";
import { ProGate } from "@/components/app/Pro";
import { TrialsPage } from "@/components/app/trials/Trials";
export const metadata: Metadata = { title: "Trials" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <ProGate feature="Trials" blurb="A sign-up form in your colours, check-in and ratings on trial night, selection by position and offers.">
      <TrialsPage initial={sp.t} />
    </ProGate>
  );
}
