import type { Metadata } from "next";
import { ClubPage } from "@/components/app/views/ClubPage";
export const metadata: Metadata = { title: "Club & members" };
export default function Page() {
  return <ClubPage />;
}
