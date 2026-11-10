import type { Metadata } from "next";
import { DevelopmentHome } from "@/components/app/idp/Development";
export const metadata: Metadata = { title: "Development" };
export default function Page() {
  return <DevelopmentHome />;
}
