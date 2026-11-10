import type { Metadata } from "next";
import { Sessions } from "@/components/app/views/Sessions";
export const metadata: Metadata = { title: "Sessions" };
export default function Page() {
  return <Sessions />;
}
