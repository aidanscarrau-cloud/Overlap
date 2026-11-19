"use client";

import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Modal } from "../fitness/Fitness";
import { errMsg } from "@/lib/format";
import { guessPos, parseCsv, parseDob, tidyName } from "@/lib/trials";
import type { Team } from "@/lib/types";

/* Bring a whole squad (or club) in from a registration spreadsheet, e.g. a PlayHQ export saved as CSV.
   Players land in the right teams; families can be emailed an invite that links them to their player. */

type Field = "first" | "last" | "full" | "dob" | "team" | "position" | "shirt" | "pfirst" | "plast" | "pname" | "pemail" | "pphone";
const LABEL: Record<Field, string> = {
  full: "Player's full name",
  first: "Player's first name",
  last: "Player's last name",
  dob: "Date of birth",
  team: "Team",
  position: "Position",
  shirt: "Shirt number",
  pname: "Parent's full name",
  pfirst: "Parent's first name",
  plast: "Parent's last name",
  pemail: "Parent's email",
  pphone: "Parent's mobile",
};
const ORDER: Field[] = ["first", "last", "full", "dob", "team", "position", "shirt", "pfirst", "plast", "pname", "pemail", "pphone"];

function guess(headers: string[]) {
  const h = headers.map((x) => x.toLowerCase().replace(/[_.]/g, " "));
  const used = new Set<number>();
  const m: Partial<Record<Field, number>> = {};
  const parent = (s: string) => /(parent|guardian|carer|contact|mother|father|mum|dad)/.test(s);
  const pick = (f: Field, test: (s: string) => boolean) => {
    if (m[f] !== undefined) return;
    const i = h.findIndex((s, k) => !used.has(k) && test(s));
    if (i >= 0) {
      m[f] = i;
      used.add(i);
    }
  };
  pick("pemail", (s) => /e-?mail/.test(s) && parent(s));
  pick("pphone", (s) => /(mobile|phone)/.test(s) && parent(s));
  pick("pfirst", (s) => parent(s) && /(first|given)/.test(s));
  pick("plast", (s) => parent(s) && /(last|surname|family)/.test(s));
  pick("pname", (s) => parent(s) && /name/.test(s));
  pick("dob", (s) => /(date of birth|dob|birth ?date|birthday)/.test(s));
  pick("first", (s) => /(first|given) ?name|^first$|forename/.test(s));
  pick("last", (s) => /(last|sur|family) ?name|^surname$|^last$/.test(s));
  pick("full", (s) => /name/.test(s) && !/(club|team|division|competition|grade)/.test(s));
  pick("team", (s) => /^team|team name|^squad$|^grade$|division|age group/.test(s));
  pick("position", (s) => /position/.test(s));
  pick("shirt", (s) => /(shirt|jersey|guernsey|number|no\.?$)/.test(s) && !/(phone|mobile|membership|registration|id)/.test(s));
  // A lone email or mobile column (registration exports often list the account holder) belongs to the parent.
  pick("pemail", (s) => /e-?mail/.test(s));
  pick("pphone", (s) => /(mobile|phone)/.test(s));
  if (m.first !== undefined && m.last !== undefined) delete m.full;
  return m;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function ImportPlayers({ team, onClose }: { team: Team; onClose: () => void }) {
  const { data, supabase, toast, refresh, canDo } = useApp();
  const teams = data.teams.filter((t) => canDo("squad.edit", t.id));
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [teamFor, setTeamFor] = useState<Record<string, string>>({});
  const [fixedTeam, setFixedTeam] = useState(team.id);
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ added: number; skipped: number; invited: number; failed: number; noEmail: number } | null>(null);
  const headers = rows?.[0] ?? [];
  const body = useMemo(() => rows?.slice(1) ?? [], [rows]);
  const cell = (r: string[], f: Field) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");

  async function read(file: File) {
    setErr("");
    if (file.size > 5_000_000) return setErr("That file is too big. Export just the players you need, as CSV.");
    if (/\.xlsx?$/i.test(file.name)) return setErr("Save the spreadsheet as CSV first (File, Save as, CSV), then choose that file.");
    const r = parseCsv(await file.text());
    if (r.length < 2) return setErr("Couldn't find any players in that file.");
    setRows(r);
    const m = guess(r[0]);
    setMap(m);
    if (m.team !== undefined) {
      const auto: Record<string, string> = {};
      for (const v of new Set(r.slice(1).map((x) => (x[m.team!] ?? "").trim()).filter(Boolean))) {
        const n = norm(v);
        const hit = teams.find((t) => norm(t.name) === n) ?? teams.find((t) => n && (norm(t.name).includes(n) || n.includes(norm(t.name))));
        auto[v] = hit?.id ?? "";
      }
      setTeamFor(auto);
    }
  }

  const people = useMemo(() => {
    if (!rows) return [];
    return body
      .map((r) => {
        const name = tidyName(cell(r, "full") || [cell(r, "first"), cell(r, "last")].filter(Boolean).join(" "));
        const dob = cell(r, "dob") ? parseDob(cell(r, "dob")) : null;
        const tv = cell(r, "team");
        const teamId = map.team !== undefined ? teamFor[tv] || "" : fixedTeam;
        const pname = tidyName(cell(r, "pname") || [cell(r, "pfirst"), cell(r, "plast")].filter(Boolean).join(" "));
        const email = cell(r, "pemail").toLowerCase();
        const shirt = Number(cell(r, "shirt"));
        return {
          name,
          teamId,
          teamValue: tv,
          birth_year: dob ? Number(dob.slice(0, 4)) : null,
          position: guessPos(cell(r, "position")) ?? "MID",
          shirt_number: Number.isInteger(shirt) && shirt > 0 && shirt < 100 ? shirt : null,
          pname,
          email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "",
        };
      })
      .filter((p) => p.name.split(" ").length >= 1 && p.name.length >= 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, map, teamFor, fixedTeam, body]);

  const existing = new Set(data.players.map((p) => `${p.team_id}|${p.full_name.toLowerCase()}`));
  const seen = new Set<string>();
  const ready = people.filter((p) => {
    const k = `${p.teamId}|${p.name.toLowerCase()}`;
    if (!p.teamId || existing.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const already = people.filter((p) => p.teamId && existing.has(`${p.teamId}|${p.name.toLowerCase()}`)).length;
  const noTeam = people.filter((p) => !p.teamId).length;
  const withEmail = ready.filter((p) => p.email).length;
  const unmatched = Object.entries(teamFor).filter(([, id]) => !id).map(([v]) => v);

  async function run() {
    setBusy("Adding players…");
    setErr("");
    const added: { id: string; full_name: string; team_id: string }[] = [];
    for (let i = 0; i < ready.length; i += 100) {
      const chunk = ready.slice(i, i + 100).map((p) => ({ club_id: data.club.id, team_id: p.teamId, full_name: p.name.slice(0, 80), position: p.position, shirt_number: p.shirt_number, birth_year: p.birth_year }));
      const { data: ins, error } = await supabase.from("players").insert(chunk).select("id,full_name,team_id");
      if (error) {
        setBusy(null);
        return setErr(`${errMsg(error)}${added.length ? ` (${added.length} were added before this.)` : ""}`);
      }
      added.push(...((ins ?? []) as typeof added));
    }
    let invited = 0;
    let failed = 0;
    if (invite) {
      const byKey = new Map(ready.map((p) => [`${p.teamId}|${p.name.slice(0, 80).toLowerCase()}`, p]));
      const wants = added.map((a) => ({ a, p: byKey.get(`${a.team_id}|${a.full_name.toLowerCase()}`) })).filter((x) => x.p?.email);
      const expires = new Date(Date.now() + 60 * 864e5).toISOString();
      for (let i = 0; i < wants.length; i += 100) {
        setBusy(`Creating invites… ${i}/${wants.length}`);
        const part = wants.slice(i, i + 100);
        const { data: inv, error } = await supabase
          .from("invites")
          .insert(part.map(({ a }) => ({ club_id: data.club.id, role: "parent", team_id: a.team_id, player_id: a.id, max_uses: 2, expires_at: expires })))
          .select("code,player_id");
        if (error) {
          setErr(`Players were added, but invites couldn't be created: ${errMsg(error)}`);
          break;
        }
        const codeFor = new Map((inv ?? []).map((x) => [x.player_id as string, x.code as string]));
        const items = part.map(({ a, p }) => ({ code: codeFor.get(a.id) ?? "", email: p!.email, parent_name: p!.pname })).filter((x) => x.code);
        for (let j = 0; j < items.length; j += 20) {
          setBusy(`Emailing families… ${i + j}/${wants.length}`);
          try {
            const r = await fetch("/api/invites/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: items.slice(j, j + 20) }) });
            const jr = (await r.json()) as { ok: boolean; sent?: number; failed?: string[]; error?: string };
            if (!jr.ok) {
              setErr(jr.error ?? "Couldn't send the invite emails.");
              failed += items.slice(j).length;
              j = items.length;
              break;
            }
            invited += jr.sent ?? 0;
            failed += jr.failed?.length ?? 0;
          } catch {
            failed += items.slice(j, j + 20).length;
          }
        }
      }
    }
    setBusy(null);
    setDone({ added: added.length, skipped: people.length - ready.length, invited, failed, noEmail: added.length - invited - failed });
    toast(`${added.length} player${added.length === 1 ? "" : "s"} added`);
    refresh();
  }

  return (
    <Modal
      title="Import players"
      onClose={onClose}
      wide
      foot={
        done ? (
          <>
            <span className="spacer" />
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : rows ? (
          <>
            <button className="btn" disabled={!!busy} onClick={() => setRows(null)}>
              Choose another file
            </button>
            <span className="spacer" />
            <button className="btn primary" disabled={!!busy || !ready.length} onClick={run}>
              {busy ?? `Add ${ready.length} player${ready.length === 1 ? "" : "s"}${invite && withEmail ? ` and email ${withEmail} famil${withEmail === 1 ? "y" : "ies"}` : ""}`}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="tr-form">
        {done ? (
          <div className="imp-done">
            <b>
              {done.added} player{done.added === 1 ? "" : "s"} added
            </b>
            <ul>
              {invite && <li>{done.invited} famil{done.invited === 1 ? "y" : "ies"} emailed an invite (it links them to their player and works for 60 days)</li>}
              {done.failed > 0 && <li>{done.failed} email{done.failed === 1 ? "" : "s"} couldn&apos;t be sent. Create those invites from Club &amp; members.</li>}
              {invite && done.noEmail > 0 && <li>{done.noEmail} had no parent email. Invite them from Club &amp; members.</li>}
              {done.skipped > 0 && <li>{done.skipped} skipped (already in the squad, no team, or listed twice)</li>}
            </ul>
            {err && <p className="tp-err">{err}</p>}
          </div>
        ) : !rows ? (
          <>
            <p>
              Choose the player list from your registration system or a spreadsheet, saved as <b>CSV</b>. For PlayHQ: export the participant or team list and open it in Excel or Google Sheets, then save or download as CSV.
            </p>
            <label className="tr-drop">
              <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
              <b>Choose CSV file</b>
              <small>Nothing is saved until you press Add.</small>
            </label>
            {err && <p className="tp-err">{err}</p>}
          </>
        ) : (
          <>
            <p>
              Found <b>{body.length}</b> row{body.length === 1 ? "" : "s"}. Check each detail comes from the right column.
            </p>
            <div className="tr-map">
              {ORDER.map((k) => (
                <label key={k} className="field">
                  <span>{LABEL[k]}</span>
                  <select className="input" value={map[k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">Not in this file</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h.length > 50 ? `${h.slice(0, 47)}…` : h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {map.team === undefined ? (
              <label className="field">
                <span>Add everyone to</span>
                <select className="input" value={fixedTeam} onChange={(e) => setFixedTeam(e.target.value)}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <section>
                <h3>Match the teams in your file</h3>
                <div className="imp-teams">
                  {Object.keys(teamFor)
                    .sort()
                    .map((v) => (
                      <label key={v} className="imp-team">
                        <span>{v}</span>
                        <select className="input" value={teamFor[v]} onChange={(e) => setTeamFor((x) => ({ ...x, [v]: e.target.value }))}>
                          <option value="">Skip these players</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                </div>
                {unmatched.length > 0 && <p className="fg-small">No team picked for {unmatched.join(", ")}. Those players will be skipped. Add the team on Club &amp; members first if you need it.</p>}
              </section>
            )}

            <label className="tr-check">
              <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
              Email each family an invite to join (links them to their player, works for 60 days, a second parent can use it too)
            </label>

            <div className="imp-sum">
              <span>
                <b>{ready.length}</b> to add
              </span>
              {already > 0 && (
                <span>
                  <b>{already}</b> already in the squad
                </span>
              )}
              {noTeam > 0 && (
                <span>
                  <b>{noTeam}</b> without a team
                </span>
              )}
              {invite && (
                <span>
                  <b>{withEmail}</b> with a parent email
                </span>
              )}
            </div>
            {ready.length > 0 && (
              <p className="fg-small">
                First few: {ready
                  .slice(0, 4)
                  .map((p) => `${p.name}${p.birth_year ? ` (${p.birth_year})` : ""}`)
                  .join(", ")}
                {ready.length > 4 ? "…" : ""}
              </p>
            )}
            {invite && withEmail > 250 && <p className="inj-warn">That&apos;s a lot of emails at once. Free email plans often allow about 300 a day, so you may want to import a few teams each day.</p>}
            {err && <p className="tp-err">{err}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
