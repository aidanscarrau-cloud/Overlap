"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { ConfirmButton } from "../sheets/SheetFrame";
import { Icon } from "@/components/ui";
import { ROLES, ROLE_HELP } from "@/lib/constants";
import { errMsg, initials } from "@/lib/format";
import type { Invite, Member, Role } from "@/lib/types";

export function ClubPage() {
  const { data, isAdmin, canEdit } = useApp();
  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">{ROLES[data.role]}</div>
          <h1>Club &amp; members</h1>
        </div>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {isAdmin && <ClubSettings />}
        {isAdmin && <TeamsCard />}
        {canEdit && <InvitesCard />}
        <MembersCard />
        <AccountCard />
      </div>
    </>
  );
}

function ClubSettings() {
  const { data, supabase, refresh, toast } = useApp();
  const [name, setName] = useState(data.club.name);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("clubs").update({ name: name.trim() }).eq("id", data.club.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Club renamed");
    refresh();
  }
  return (
    <section className="card">
      <div className="card-h">
        <h2>Club</h2>
      </div>
      <form className="card-b" onSubmit={save} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 260px" }}>
          <span>Club name</span>
          <input className="input" id="club-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {name.trim() !== data.club.name && (
          <button className="btn primary" type="submit" disabled={busy}>
            Save
          </button>
        )}
      </form>
    </section>
  );
}

function TeamsCard() {
  const { data, open } = useApp();
  return (
    <section className="card">
      <div className="card-h">
        <h2>Teams</h2>
        <button className="btn sm" onClick={() => open({ kind: "team", id: null })}>
          <Icon id="i-plus" />
          Add team
        </button>
      </div>
      <div className="card-b rows">
        {data.teams.length ? (
          data.teams.map((t) => (
            <button key={t.id} className="rowi" onClick={() => open({ kind: "team", id: t.id })}>
              <svg className="crest" aria-hidden="true" style={{ width: 32, height: 32 }}>
                <use href="#crest" />
              </svg>
              <span className="rt">
                <b>{t.name}</b>
                <span>
                  {[t.age_group, t.coach_name && `Coach: ${t.coach_name}`, `${data.players.filter((p) => p.team_id === t.id).length} players`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="btn sm">Edit</span>
            </button>
          ))
        ) : (
          <p className="muted">No teams yet.</p>
        )}
      </div>
    </section>
  );
}

function InvitesCard() {
  const { data, isAdmin, team, supabase, toast } = useApp();
  const allowed: Role[] = isAdmin ? ["coach", "player", "parent", "admin"] : ["player", "parent"];
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [role, setRole] = useState<Role>(allowed[0]);
  const [teamId, setTeamId] = useState(team?.id ?? "");
  const [playerId, setPlayerId] = useState("");
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const linkable = role === "player" || role === "parent";
  const teamPlayers = data.players.filter((p) => p.team_id === teamId).sort((a, b) => a.full_name.localeCompare(b.full_name));

  async function load() {
    const { data: rows, error } = await supabase
      .from("invites")
      .select("code,role,team_id,player_id,expires_at,max_uses,uses")
      .eq("club_id", data.club.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) return toast(errMsg(error));
    setInvites(((rows ?? []) as Invite[]).filter((i) => i.uses < i.max_uses));
  }
  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const row = {
      club_id: data.club.id,
      role,
      team_id: teamId || null,
      player_id: linkable && playerId ? playerId : null,
      max_uses: multi && !(linkable && playerId) ? 50 : 1,
    };
    const { error } = await supabase.from("invites").insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Invite created");
    setPlayerId("");
    load();
  }
  async function remove(code: string) {
    const { error } = await supabase.from("invites").delete().eq("code", code);
    if (error) return toast(errMsg(error));
    toast("Invite cancelled");
    load();
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Invite link copied");
    } catch {
      toast("Copy didn't work. Select the link and copy it instead.");
    }
  }

  const teamName = (id: string | null) => data.teams.find((t) => t.id === id)?.name;
  const playerName = (id: string | null) => data.players.find((p) => p.id === id)?.full_name;

  return (
    <section className="card">
      <div className="card-h">
        <h2>Invite people</h2>
      </div>
      <div className="card-b" style={{ display: "grid", gap: 16 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Create a code and send it, or its link, to the person. They sign up, enter the code and join with the role you chose. Codes last 14 days.
        </p>
        <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
          <div className="row2">
            <label className="field">
              <span>Role</span>
              <select className="input" id="inv-role" value={role} onChange={(e) => (setRole(e.target.value as Role), setPlayerId(""))}>
                {allowed.map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Team</span>
              <select className="input" id="inv-team" value={teamId} onChange={(e) => (setTeamId(e.target.value), setPlayerId(""))}>
                <option value="">{role === "admin" || role === "coach" ? "All teams" : "No team"}</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {linkable && teamId && (
              <label className="field">
                <span>{role === "parent" ? "Their child" : "Which player"}</span>
                <select className="input" id="inv-player" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                  <option value="">Not linked</option>
                  {teamPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            {ROLE_HELP[role]}.{linkable && " Link a player so they can update that player's availability."}
          </span>
          {!(linkable && playerId) && (
            <label className="check">
              <input type="checkbox" id="inv-multi" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <span>Let up to 50 people use this code (for example, share it in a team group chat)</span>
            </label>
          )}
          <div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create invite code"}
            </button>
          </div>
        </form>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Active invites
          </div>
          {invites === null ? (
            <p className="muted">Loading…</p>
          ) : invites.length ? (
            <div className="rows">
              {invites.map((i) => {
                const link = `${origin}/join/${i.code}`;
                return (
                  <div key={i.code} className="invite">
                    <code>{i.code}</code>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: "block" }}>
                        {ROLES[i.role]}
                        {teamName(i.team_id) ? ` · ${teamName(i.team_id)}` : ""}
                        {playerName(i.player_id) ? ` · for ${playerName(i.player_id)}` : ""}
                      </b>
                      <span className="muted" style={{ fontSize: 12.5, wordBreak: "break-all" }}>
                        {link} · {i.max_uses > 1 ? `${i.uses}/${i.max_uses} used · ` : ""}expires {new Date(i.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="btn sm" onClick={() => copy(link)}>
                        Copy link
                      </button>
                      <ConfirmButton className="btn sm danger" label="Cancel" onConfirm={() => remove(i.code)} />
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No active invites.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function MembersCard() {
  const { data, isAdmin } = useApp();
  const order: Role[] = ["admin", "coach", "player", "parent"];
  const members = [...data.members].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.full_name.localeCompare(b.full_name));
  return (
    <section className="card">
      <div className="card-h">
        <h2>Members</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {data.members.length} {data.members.length === 1 ? "person" : "people"}
        </span>
      </div>
      <div className="card-b mlist">
        {members.map((m) => (
          <MemberRow key={m.id} m={m} editable={isAdmin && m.user_id !== data.userId} />
        ))}
      </div>
    </section>
  );
}

function MemberRow({ m, editable }: { m: Member; editable: boolean }) {
  const { data, supabase, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const teamName = data.teams.find((t) => t.id === m.team_id)?.name;
  const playerName = data.players.find((p) => p.id === m.player_id)?.full_name;
  const isMe = m.user_id === data.userId;

  async function update(patch: Partial<Pick<Member, "role" | "team_id" | "player_id">>) {
    setBusy(true);
    const { error } = await supabase.from("memberships").update(patch).eq("id", m.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Member updated");
    refresh();
  }
  async function remove() {
    const { error } = await supabase.from("memberships").delete().eq("id", m.id);
    if (error) return toast(errMsg(error));
    toast(`${m.full_name} removed from the club`);
    refresh();
  }

  return (
    <div className="mrow">
      <span className="av">{initials(m.full_name)}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ display: "block" }}>
          {m.full_name}
          {isMe && <span className="muted"> (you)</span>}
        </b>
        <span className="muted" style={{ fontSize: 13 }}>
          {[!editable && ROLES[m.role], teamName, playerName && (m.role === "parent" ? `Parent of ${playerName}` : `Player: ${playerName}`)].filter(Boolean).join(" · ") || ROLES[m.role]}
        </span>
      </span>
      {editable ? (
        <>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select className="input" aria-label={`Role for ${m.full_name}`} value={m.role} disabled={busy} onChange={(e) => update({ role: e.target.value as Role })}>
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLES[r]}
                </option>
              ))}
            </select>
            <select className="input" aria-label={`Team for ${m.full_name}`} value={m.team_id ?? ""} disabled={busy} onChange={(e) => update({ team_id: e.target.value || null })}>
              <option value="">No team</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </span>
          <ConfirmButton className="btn sm danger" label="Remove" onConfirm={remove} />
        </>
      ) : (
        <span className="role-pill">{ROLES[m.role]}</span>
      )}
    </div>
  );
}

function AccountCard() {
  const { data, supabase, refresh, toast } = useApp();
  const router = useRouter();
  const [name, setName] = useState(data.myName);
  const [busy, setBusy] = useState(false);
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", data.userId);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Name updated");
    refresh();
  }
  async function leave() {
    const { error } = await supabase.from("memberships").delete().eq("id", data.me.id);
    if (error) return toast(errMsg(error));
    document.cookie = "overlap-club=; path=/; max-age=0";
    router.replace("/");
    router.refresh();
  }
  return (
    <section className="card" id="account">
      <div className="card-h">
        <h2>Your account</h2>
      </div>
      <div className="card-b" style={{ display: "grid", gap: 14 }}>
        <form onSubmit={saveName} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 240px" }}>
            <span>Your name (shown to your club)</span>
            <input className="input" id="my-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {name.trim() !== data.myName && (
            <button className="btn primary" type="submit" disabled={busy}>
              Save
            </button>
          )}
        </form>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <form action="/auth/signout" method="post">
            <button className="btn" type="submit">
              Sign out
            </button>
          </form>
          <a className="btn" href="/onboarding">
            Join or start another club
          </a>
          {data.role !== "admin" && <ConfirmButton className="btn danger" label={`Leave ${data.club.name}`} onConfirm={leave} />}
        </div>
      </div>
    </section>
  );
}
