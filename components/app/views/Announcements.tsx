"use client";

import { pingPush } from "@/lib/push-client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton } from "../sheets/SheetFrame";
import { errMsg } from "@/lib/format";
import { Linkify } from "@/components/Linkify";
import type { Announcement } from "@/lib/types";

export const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

/** Teams this person may post to; null in the list means the whole club. */
export function usePostTargets() {
  const { data, isAdmin, canDo } = useApp();
  const teams = data.teams.filter((t) => canDo("announcements.post", t.id));
  return { canPost: isAdmin || teams.length > 0, clubWide: isAdmin, teams };
}

export function Announcements() {
  const { data, team } = useApp();
  const { canPost } = usePostTargets();
  const [filter, setFilter] = useState<"all" | "club" | string>("all");
  const list = data.announcements.filter((a) => filter === "all" || (filter === "club" ? !a.team_id : a.team_id === filter));
  const teamIdsWithPosts = [...new Set(data.announcements.map((a) => a.team_id).filter(Boolean))] as string[];

  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">{data.club.name}</div>
          <h1>Announcements</h1>
        </div>
      </div>
      {canPost && <Composer defaultTeam={team?.id ?? null} />}
      {data.announcements.length > 0 && (
        <div className="toolbar">
          <div className="chips">
            <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              All
            </button>
            <button className="chip" aria-pressed={filter === "club"} onClick={() => setFilter("club")}>
              Whole club
            </button>
            {data.teams
              .filter((t) => teamIdsWithPosts.includes(t.id))
              .map((t) => (
                <button key={t.id} className="chip" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>
                  {t.name}
                </button>
              ))}
          </div>
        </div>
      )}
      <div className="news">
        {list.length ? list.map((a) => <AnnouncementItem key={a.id} a={a} />) : <div className="empty">{canPost ? "No announcements yet. Post the first one above." : "No announcements yet."}</div>}
      </div>
    </>
  );
}

export function AnnouncementItem({ a, compact }: { a: Announcement; compact?: boolean }) {
  const { data, isAdmin, supabase, refresh, toast } = useApp();
  const mine = a.author_id === data.userId;
  const teamName = a.team_id ? data.teams.find((t) => t.id === a.team_id)?.name : null;
  async function setPinned(pinned: boolean) {
    const { error } = await supabase.from("announcements").update({ pinned }).eq("id", a.id);
    if (error) return toast(errMsg(error));
    toast(pinned ? "Pinned to the top" : "Unpinned");
    refresh();
  }
  async function remove() {
    const { error } = await supabase.from("announcements").delete().eq("id", a.id);
    if (error) return toast(errMsg(error));
    toast("Announcement deleted");
    refresh();
  }
  return (
    <article className={`news-item${a.pinned ? " pinned" : ""}${compact ? " compact" : ""}`}>
      <div className="news-meta">
        {a.pinned && <span className="news-pin">Pinned</span>}
        <span className="news-to">{teamName ?? "Whole club"}</span>
        <span>
          {a.author_name || "Club"} · {timeAgo(a.created_at)}
        </span>
      </div>
      <h3>
        <Linkify text={a.title} />
      </h3>
      {a.body && (
        <p className={compact ? "clamp" : undefined}>
          <Linkify text={a.body} />
        </p>
      )}
      {!compact && (isAdmin || mine) && (
        <div className="news-acts">
          <button className="btn sm" onClick={() => setPinned(!a.pinned)}>
            {a.pinned ? "Unpin" : "Pin to top"}
          </button>
          <ConfirmButton className="btn sm danger" label="Delete" onConfirm={remove} />
        </div>
      )}
    </article>
  );
}

function Composer({ defaultTeam }: { defaultTeam: string | null }) {
  const { data, supabase, refresh, toast } = useApp();
  const { clubWide, teams } = usePostTargets();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState<string>(clubWide ? "club" : (teams.find((t) => t.id === defaultTeam) ?? teams[0])?.id ?? "");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({ club_id: data.club.id, team_id: to === "club" ? null : to, title: title.trim(), body: body.trim(), pinned });
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    setTitle("");
    setBody("");
    setPinned(false);
    setOpen(false);
    toast("Announcement posted");
    refresh();
  }

  if (!open)
    return (
      <button className="card composer-open" onClick={() => setOpen(true)}>
        <svg className="i" aria-hidden="true">
          <use href="#i-megaphone" />
        </svg>
        Post an announcement…
      </button>
    );

  return (
    <form className="card card-b composer" onSubmit={post}>
      <label className="field">
        <span>Title</span>
        <input className="input" id="ann-title" autoFocus required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Training moved to Pitch 2 this Thursday" />
      </label>
      <label className="field">
        <span>Message (optional)</span>
        <textarea className="input" id="ann-body" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 200px" }}>
          <span>Send to</span>
          <select className="input" id="ann-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {clubWide && <option value="club">Whole club</option>}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check" style={{ paddingBottom: 10 }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <span>Pin to the top</span>
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
          {busy ? "Posting…" : "Post announcement"}
        </button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
