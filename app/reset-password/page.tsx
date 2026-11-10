"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { errMsg } from "@/lib/format";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errMsg(error));
    router.replace("/");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <h2>Choose a new password</h2>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <label className="field">
            <span>New password</span>
            <input className="input" id="new-password" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
