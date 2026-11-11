"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { ConfirmButton } from "../sheets/SheetFrame";
import { Crest, Icon } from "@/components/ui";
import { LogoPicker } from "../LogoPicker";
import { SampleDataCard } from "../SampleDataCard";
import { removeLogoFile, uploadLogo } from "@/lib/logo";
import { ROLES, ROLE_HELP } from "@/lib/constants";
import { errMsg, initials } from "@/lib/format";
import type { Invite, Member, Role } from "@/lib/types";
import { CONFIGURABLE_ROLES, PERMS, defaultPerm, type Perm } from "@/lib/permissions";

export function ClubPage() {
  const { data, isAdmin, can } = useApp();
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
        {isAdmin && <SampleDataCard />}
        {isAdmin && <TeamsCard />}
        {isAdmin && <RolesCard />}
        {(isAdmin || can("invites.create")) && <InvitesCard />}
        {(isAdmin || can("members.view")) && <MembersCard />}
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
      <div className="card-b" style={{ paddingTop: 0 }}>
        <LogoPicker
          url={data.club.logo_url}
          label="Club logo"
          help="Shown in the sidebar and on team cards. PNG, JPG or WebP; square with a transparent background looks best. You can also drag an image here."
          onPick={async (file) => {
            const url = await uploadLogo(supabase, data.club.id, "club", file);
            const { error } = await supabase.from("clubs").update({ logo_url: url }).eq("id", data.club.id);
            if (error) throw error;
            await removeLogoFile(supabase, data.club.logo_url);
            toast("Club logo updated");
            refresh();
          }}
          onRemove={async () => {
            const { error } = await supabase.from("clubs").update({ logo_url: null }).eq("id", data.club.id);
            if (error) throw error;
            await removeLogoFile(supabase, data.club.logo_url);
            toast("Club logo removed");
            refresh();
          }}
        />
      </div>
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
              <Crest url={t.logo_url ?? data.club.logo_url} size={32} />
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
  const inviteTeams = isAdmin ? data.teams : data.teams.filter((t) => data.myTeamIds.includes(t.id));
  const [teamId, setTeamId] = useState((team && inviteTeams.some((t) => t.id === team.id) ? team.id : inviteTeams[0]?.id) ?? "");
  // "__new" adds a new player to the squad when the person joins (the only choice for a team with no players yet).
  const [playerId, setPlayerId] = useState("__new");
  const [childName, setChildName] = useState("");
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const linkable = role === "player" || role === "parent";
  const teamPlayers = data.players.filter((p) => p.team_id === teamId).sort((a, b) => a.full_name.localeCompare(b.full_name));

  async function load() {
    const { data: rows, error } = await supabase
      .from("invites")
      .select("code,role,team_id,player_id,create_player,new_player_name,expires_at,max_uses,uses")
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
    const isNew = linkable && !!teamId && playerId === "__new";
    if (isNew && role === "parent" && !childName.trim()) return toast("Enter the child's name, so they're added to the squad.");
    const singleUse = linkable && !!playerId && !(isNew && role === "player");
    setBusy(true);
    const row = {
      club_id: data.club.id,
      role,
      team_id: teamId || null,
      player_id: linkable && playerId && !isNew ? playerId : null,
      create_player: isNew,
      new_player_name: isNew && role === "parent" ? childName.trim() : null,
      max_uses: multi && !singleUse ? 50 : 1,
    };
    const { error } = await supabase.from("invites").insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Invite created");
    setPlayerId("__new");
    setChildName("");
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
              <select className="input" id="inv-role" value={role} onChange={(e) => (setRole(e.target.value as Role), setPlayerId("__new"))}>
                {allowed.map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Team</span>
              <select className="input" id="inv-team" value={teamId} onChange={(e) => (setTeamId(e.target.value), setPlayerId("__new"))}>
                {isAdmin && <option value="">{role === "coach" ? "Assign teams later" : "No team"}</option>}
                {inviteTeams.map((t) => (
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
                  <option value="__new">{role === "parent" ? "New player: add their child to the squad" : "New player: add them to the squad"}</option>
                  {teamPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                  <option value="">Not linked (link them later)</option>
                </select>
              </label>
            )}
            {linkable && teamId && playerId === "__new" && role === "parent" && (
              <label className="field">
                <span>Child&apos;s name</span>
                <input className="input" id="inv-child" maxLength={80} value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="e.g. Leo Smith" />
              </label>
            )}
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            {ROLE_HELP[role]}.{linkable && " Choose the player so they can reply to sessions and update availability."}
          </span>
          {linkable && teamId && playerId === "__new" && (
            <span className="muted" style={{ fontSize: 13 }}>
              {role === "parent"
                ? "When they join, their child is added to the squad and linked to their account."
                : "When they join, they're added to the squad under their own name and can reply to sessions straight away."}
            </span>
          )}
          {linkable && (!playerId || !teamId) && (
            <div className="notice bad" style={{ fontSize: 13.5 }}>
              No player chosen. They&apos;ll be able to look around but can&apos;t reply to sessions until you link them to a player in the Members list.
            </div>
          )}
          {(!linkable || !playerId || !teamId || (playerId === "__new" && role === "player")) && (
            <label className="check">
              <input type="checkbox" id="inv-multi" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <span>
                {linkable && teamId && playerId === "__new"
                  ? "Let up to 50 players use this code: each one is added to the squad when they join (good for a team group chat)"
                  : "Let up to 50 people use this code (for example, share it in a team group chat)"}
              </span>
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
                        {playerName(i.player_id) ? ` · for ${playerName(i.player_id)}` : i.create_player ? (i.new_player_name ? ` · adds ${i.new_player_name} to the squad` : " · adds them to the squad") : ""}
                      </b>
                      <span className="muted" style={{ fontSize: 13, wordBreak: "break-all" }}>
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
  const teamNames = data.teams.filter((t) => m.team_ids.includes(t.id)).map((t) => t.name);
  const linkedPlayers = data.players.filter((p) => m.player_ids.includes(p.id));
  const linkedNames = linkedPlayers.map((p) => p.full_name).join(", ");
  const isMe = m.user_id === data.userId;

  async function run(fn: () => PromiseLike<{ error: unknown }>, msg: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(msg);
    refresh();
  }
  const setRole = (role: Role) => run(() => supabase.from("memberships").update({ role }).eq("id", m.id), "Role updated");
  const linkPlayer = (player_id: string) =>
    run(() => supabase.from("member_players").insert({ membership_id: m.id, player_id }), "Player linked");
  const unlinkPlayer = (player_id: string) =>
    run(() => supabase.from("member_players").delete().eq("membership_id", m.id).eq("player_id", player_id), "Player unlinked");
  const linkable = m.role === "player" || m.role === "parent";
  // Offer players from the member's teams first; if they have none, every player in the club.
  const playerOptions = data.players
    .filter((p) => !m.player_ids.includes(p.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const toggleTeam = (teamId: string, on: boolean) =>
    run(
      () =>
        on
          ? supabase.from("member_teams").insert({ membership_id: m.id, team_id: teamId })
          : supabase.from("member_teams").delete().eq("membership_id", m.id).eq("team_id", teamId),
      on ? "Team added" : "Team removed",
    );
  async function remove() {
    const { error } = await supabase.from("memberships").delete().eq("id", m.id);
    if (error) return toast(errMsg(error));
    toast(`${m.full_name} removed from the club`);
    refresh();
  }

  const summary = [
    !editable && ROLES[m.role],
    m.role === "admin" ? "All teams" : teamNames.join(", ") || (m.role === "coach" ? "No teams assigned yet" : ""),
    linkedNames && (m.role === "parent" ? `Parent of ${linkedNames}` : `Player: ${linkedNames}`),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mrow">
      <span className="av">{initials(m.full_name)}</span>
      <span style={{ minWidth: 0, display: "grid", gap: 6 }}>
        <span>
          <b style={{ display: "block" }}>
            {m.full_name}
            {isMe && <span className="muted"> (you)</span>}
          </b>
          <span className="muted" style={{ fontSize: 13 }}>
            {summary || ROLES[m.role]}
          </span>
        </span>
        {editable && linkable && (
          <span className="insp-f" style={{ flexWrap: "wrap" }}>
            {m.role === "parent" ? "Parent of" : "Is player"}
            {linkedPlayers.map((p) => (
              <span key={p.id} className="link-chip">
                {p.full_name}
                <button type="button" aria-label={`Unlink ${p.full_name}`} disabled={busy} onClick={() => unlinkPlayer(p.id)}>
                  ✕
                </button>
              </span>
            ))}
            {(m.role === "parent" || !linkedPlayers.length) && (
              <select
                className="input"
                style={{ width: "auto", maxWidth: 230 }}
                aria-label={`Link a player to ${m.full_name}`}
                value=""
                disabled={busy}
                onChange={(e) => e.target.value && linkPlayer(e.target.value)}
              >
                <option value="">{linkedPlayers.length ? "+ Add another child…" : m.role === "parent" ? "Choose their child…" : "Choose their player…"}</option>
                {playerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {data.teams.length > 1 ? ` (${data.teams.find((t) => t.id === p.team_id)?.name ?? ""})` : ""}
                  </option>
                ))}
              </select>
            )}
            {!linkedPlayers.length && <span className="rbadge wait">Can&apos;t reply to sessions until linked</span>}
          </span>
        )}
        {editable && m.role !== "admin" && data.teams.length > 0 && (
          <span className="chips" role="group" aria-label={`Teams for ${m.full_name}`}>
            {data.teams.map((t) => {
              const on = m.team_ids.includes(t.id);
              return (
                <button key={t.id} type="button" className="chip" aria-pressed={on} disabled={busy} onClick={() => toggleTeam(t.id, !on)}>
                  {t.name}
                </button>
              );
            })}
          </span>
        )}
      </span>
      {editable ? (
        <>
          <select className="input" aria-label={`Role for ${m.full_name}`} value={m.role} disabled={busy} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLES[r]}
              </option>
            ))}
          </select>
          <ConfirmButton className="btn sm danger" label="Remove" onConfirm={remove} />
        </>
      ) : (
        <span className="role-pill">{ROLES[m.role]}</span>
      )}
    </div>
  );
}

function RolesCard() {
  const { data, supabase, refresh, toast } = useApp();
  const [busy, setBusy] = useState("");
  const value = (role: Exclude<Role, "admin">, perm: Perm) => data.rolePerms.find((r) => r.role === role && r.perm === perm)?.allowed ?? defaultPerm(role, perm);

  async function toggle(role: Exclude<Role, "admin">, perm: Perm) {
    const key = role + perm;
    setBusy(key);
    const { error } = await supabase
      .from("role_permissions")
      .upsert({ club_id: data.club.id, role, perm, allowed: !value(role, perm) }, { onConflict: "club_id,role,perm" });
    setBusy("");
    if (error) return toast(errMsg(error));
    toast(`${ROLES[role]}s: ${PERMS.find((p) => p.key === perm)!.label.toLowerCase()} ${!value(role, perm) ? "on" : "off"}`);
    refresh();
  }

  return (
    <section className="card">
      <div className="card-h">
        <h2>Roles &amp; permissions</h2>
      </div>
      <div className="card-b" style={{ display: "grid", gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Choose what each role can do. Coaches, players and parents only work with the teams they belong to (set below in Members), unless &quot;See all teams&quot; is on. Club admins can always do everything.
        </p>
        <div className="perm-wrap">
          <table className="perm-table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {CONFIGURABLE_ROLES.map((r) => (
                  <th key={r} scope="col">
                    {ROLES[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMS.map((p) => (
                <tr key={p.key}>
                  <th scope="row">
                    <b>{p.label}</b>
                    <span>{p.help}</span>
                  </th>
                  {CONFIGURABLE_ROLES.map((r) => {
                    const on = value(r, p.key);
                    return (
                      <td key={r}>
                        <button
                          type="button"
                          className="switch"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${ROLES[r]}: ${p.label}`}
                          disabled={busy === r + p.key}
                          onClick={() => toggle(r, p.key)}
                        >
                          <i />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
            Enter an invite code
          </a>
          {data.role !== "admin" && <ConfirmButton className="btn danger" label={`Leave ${data.club.name}`} onConfirm={leave} />}
        </div>
      </div>
    </section>
  );
}
