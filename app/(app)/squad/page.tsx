import type { Metadata } from "next";
import { Squad } from "@/components/app/views/Squad";
export const metadata: Metadata = { title: "Squad" };
export default function Page() {
  return <Squad />;
}
