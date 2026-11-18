"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errMsg } from "@/lib/format";

type Mode = "signin" | "signup" | "forgot";

export function LoginForm({ next, initialError, startMode, clubName }: { next: string; initialError?: string; startMode: Mode; clubName?: string }) {
  const router = useRouter();
  // Arrived from an invite link (/join/CODE): say so, and keep the code with the new account.
  const inviteCode = (next.match(/^\/join\/([A-Za-z0-9]+)/) ?? next.match(/[?&]code=([A-Za-z0-9]+)/))?.[1]?.toUpperCase();
  const [code, setCode] = useState("");
  const useCode = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return setError("Check the code: it's the letters and numbers in your invite.");
    router.push(`/login?next=${encodeURIComponent(`/join/${c}`)}&mode=signup`);
    setMode("signup");
  };
  const [mode, setMode] = useState<Mode>(startMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    initialError === "link" ? "If you just confirmed your email, it's done: sign in below to carry on. Otherwise the link has expired, so try again." : "",
  );
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
        // Remember the invite code on the account itself, so it survives the email confirmation
        // even if the link is opened on another phone or in another browser.
        const invite = (next.match(/^\/join\/([A-Za-z0-9]+)/) ?? next.match(/[?&]code=([A-Za-z0-9]+)/))?.[1]?.toUpperCase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim(), ...(invite ? { invite_code: invite } : {}) },
            emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
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
      {inviteCode && mode !== "forgot" && (
        <div className="auth-invite" role="status">
          <b>You&apos;re joining with invite code {inviteCode}</b>
          <span>{mode === "signup" ? "Create your account below. Already have one? Sign in instead." : "Sign in, or create an account if you're new."}</span>
        </div>
      )}
      {mode === "signup" && !inviteCode && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Joining a club? Use the invite link or code from your club so you land in the right team.
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
      {mode !== "forgot" && !inviteCode && (
        <section className="auth-join" aria-label="How to join">
          <h3>New to {clubName ?? "Overlap"}?</h3>
          <ol>
            <li>
              <b>Players and parents:</b> open the invite link your coach or club sent you by email or text. It brings you here and puts you straight into the right team.
            </li>
            <li>
              <b>Got a code instead?</b> Type it here:
              <form className="auth-code" onSubmit={useCode}>
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ABCD2345" aria-label="Invite code" autoCapitalize="characters" autoComplete="off" maxLength={16} />
                <button className="btn" type="submit">
                  Join
                </button>
              </form>
            </li>
            <li>
              <b>No invite yet?</b> Ask your coach or club secretary to send you one from Overlap.
            </li>
            <li>
              <b>Starting a new club?</b>{" "}
              <button type="button" className="linkbtn inline" onClick={() => setMode("signup")}>
                Create an account
              </button>{" "}
              and you&apos;ll be guided through setting it up.
            </li>
          </ol>
        </section>
      )}
      {mode === "forgot" && (
        <button type="button" className="linkbtn" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      )}
    </div>
  );
}
