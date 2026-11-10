import type { Metadata } from "next";
import { Announcements } from "@/components/app/views/Announcements";
export const metadata: Metadata = { title: "Announcements" };
export default function Page() {
  return <Announcements />;
}
