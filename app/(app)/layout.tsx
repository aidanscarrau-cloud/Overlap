import { cookies } from "next/headers";
import { getClubData } from "@/lib/data";
import { AppProvider } from "@/components/app/AppProvider";
import { Shell } from "@/components/app/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const data = await getClubData();
  const jar = await cookies();
  return (
    <AppProvider data={data} initialTeam={jar.get("overlap-team")?.value ?? null}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
