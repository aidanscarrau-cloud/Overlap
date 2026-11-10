"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addSampleData } from "@/lib/sample";
import { errMsg } from "@/lib/format";

export function OnboardingForm({ code: initialCode, name: initialName, email, hasClub }: { code: string; name: string; email: string; hasClub: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [name, setName] = useState(initialName);
  const [clubName, setClubName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function goToClub(id: string) {
    document.cookie = `overlap-club=${id}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = "overlap-team=; path=/; max-age=0";
    router.replace("/");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = createClient();
    try {
      if (mode === "create") {
        setBusy("Creating your club…");
        const { data, error } = await supabase.rpc("create_club", { club_name: clubName.trim(), your_name: name.trim() });
        if (error) throw error;
        if (sample) {
          setBusy("Adding sample teams, players and drills…");
          await addSampleData(supabase, data as string);
        }
        goToClub(data as string);
      } else {
        setBusy("Joining…");
        const { data, error } = await supabase.rpc("join_club", { invite_code: code.trim(), your_name: name.trim() });
        if (error) throw error;
        goToClub(data as string);
      }
    } catch (err) {
      setError(errMsg(err));
      setBusy("");
    }
  }

  return (
    <div className="auth-card">
      <div>
        <div className="eyebrow">Signed in as {email}</div>
        <h2 style={{ marginTop: 6 }}>{hasClub ? "Add another club" : "Get started"}</h2>
      </div>
      <div className="choice">
        <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>
          <b>Start a club</b>
          <span>You become the club admin and invite your coaches, players and parents.</span>
        </button>
        <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")}>
          <b>Join a club</b>
          <span>Use the invite code your club admin or coach gave you.</span>
        </button>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input className="input" id="your-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Taylor" />
        </label>
        {mode === "create" ? (
          <>
            <label className="field">
              <span>Club name</span>
              <input className="input" id="club-name" required maxLength={80} value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="e.g. Riverside Athletic FC" />
            </label>
            <label className="check">
              <input type="checkbox" id="sample" checked={sample} onChange={(e) => setSample(e.target.checked)} />
              <span>
                Add sample teams, players, drills and sessions so you can try things out. You can delete them later.
              </span>
            </label>
          </>
        ) : (
          <label className="field">
            <span>Invite code</span>
            <input className="input code-input" id="invite-code" required maxLength={12} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" autoComplete="off" />
          </label>
        )}
        <button className="btn primary" type="submit" disabled={!!busy}>
          {busy || (mode === "create" ? "Create club" : "Join club")}
        </button>
      </form>
      {hasClub && (
        <a className="linkbtn" href="/">
          Back to my club
        </a>
      )}
    </div>
  );
}
