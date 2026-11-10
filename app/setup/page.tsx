import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Finish setup" };
export const dynamic = "force-dynamic";

// Shown when the Supabase environment variables are missing from the deployment.
export default function SetupPage() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (hasUrl && hasKey) redirect("/");
  return (
    <AuthShell>
      <div className="auth-card">
        <h2>Finish setup</h2>
        <p style={{ margin: 0 }}>Overlap can&apos;t reach its database yet. Add these environment variables to your Vercel project, then redeploy:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>
            <code>NEXT_PUBLIC_SUPABASE_URL</code> {hasUrl ? "✓ set" : "✗ missing"}
          </li>
          <li>
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> {hasKey ? "✓ set" : "✗ missing"}
          </li>
        </ul>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          In Vercel: Settings → Environment Variables. Then go to Deployments, open the latest one&apos;s ⋯ menu and choose Redeploy. Values are read when the site is built, so a redeploy is needed after adding them.
        </p>
      </div>
    </AuthShell>
  );
}
