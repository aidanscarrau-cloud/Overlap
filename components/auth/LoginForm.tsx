"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errMsg } from "@/lib/format";

type Mode = "signin" | "signup" | "forgot";

export function LoginForm({ next, initialError, startMode }: { next: string; initialError?: string; startMode: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(startMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError === "link" ? "That sign-in link is invalid or has expired. Try again." : "");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const supabase = createClient();
    const origin = window.location.origin;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setInfo(`We sent a confirmation link to ${email}. Open it to finish creating your account.`);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
      if (error) throw error;
      setInfo(`If ${email} has an account, a password reset link is on its way.`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  return (
    <div className="auth-card">
      <h2>{title}</h2>
      {mode !== "forgot" && (
        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>
      )}
      {mode === "signup" && !next.startsWith("/join/") && !next.startsWith("/onboarding?code=") && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          You&apos;ll need an invite code from your club to get in after creating your account.
        </p>
      )}
      {error && <div className="notice bad" role="alert">{error}</div>}
      {info && <div className="notice" role="status">{info}</div>}
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label className="field">
            <span>Your name</span>
            <input className="input" id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Taylor" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input className="input" id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "forgot" && (
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>
      {mode === "signin" && (
        <button type="button" className="linkbtn" onClick={() => setMode("forgot")}>
          Forgot your password?
        </button>
      )}
      {mode === "forgot" && (
        <button type="button" className="linkbtn" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      )}
    </div>
  );
}
