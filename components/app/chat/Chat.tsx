"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { Linkify } from "@/components/Linkify";
import { pingPush } from "@/lib/push-client";
import { ROLES } from "@/lib/constants";
import { errMsg, initials } from "@/lib/format";
import type { ChatSummary, Role } from "@/lib/types";

type Msg = { id: string; channel_id: string; author_id: string | null; author_name: string; body: string; created_at: string; deleted_at: string | null; deleted_by_name: string | null };
type Contact = { user_id: string; name: string; role: Role };
const PAGE = 60;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
};
const ago = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? time(iso) : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

export function Chat() {
  const { data, supabase, patch } = useApp();
  const [chats, setChats] = useState<ChatSummary[]>(data.chats);
  useEffect(() => setChats(data.chats), [data.chats]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Open a chat from a notification link (?c=<id>), or the first chat on wide screens.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) {
      setOpenId(c);
      window.history.replaceState(null, "", "/chat");
    } else if (window.matchMedia("(min-width: 861px)").matches && data.chats[0]) setOpenId(data.chats[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    const { data: rows } = await supabase.rpc("chat_overview", { p_club: data.club.id });
    if (rows) {
      setChats(rows as ChatSummary[]);
      patch((d) => ({ ...d, chats: rows as ChatSummary[] }));
    }
  }, [supabase, data.club.id, patch]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  if (!data.chatAllowed)
    return (
      <div className="calm-home">
        <h1>Chat</h1>
        <p>Team chat is for players aged {data.role === "player" ? "14 and over" : "over the club's age limit"}. Your parents can see the team chat and will pass on anything you need to know.</p>
      </div>
    );

  const current = chats.find((c) => c.id === openId) ?? null;
  const canDM = data.role !== "player";

  return (
    <div className="chat" data-open={openId ? "conv" : "list"}>
      <aside className="chat-list" aria-label="Chats">
        <div className="chat-list-head">
          <h1>Chat</h1>
          {canDM && (
            <button className="btn sm" onClick={() => setPicking(!picking)} aria-expanded={picking}>
              New message
            </button>
          )}
        </div>
        {picking && (
          <ContactPicker
            onOpen={async (id) => {
              setPicking(false);
              await reload();
              setOpenId(id);
            }}
          />
        )}
        <ul>
          {chats.map((c) => (
            <li key={c.id}>
              <button type="button" aria-current={c.id === openId || undefined} onClick={() => setOpenId(c.id)}>
                <span className={`chat-av ${c.kind}`} aria-hidden="true">
                  {c.kind === "direct" ? initials(c.name) : c.kind === "staff" ? "ST" : "TM"}
                </span>
                <span className="chat-li-main">
                  <span className="chat-li-top">
                    <b>{c.kind === "team" ? `${c.name} team` : c.name}</b>
                    <small>{ago(c.last_at)}</small>
                  </span>
                  <span className="chat-li-last">
                    {c.last_body ? (c.kind === "direct" ? c.last_body : `${(c.last_author ?? "").split(" ")[0]}: ${c.last_body}`) : c.kind === "team" ? "Team chat" : c.kind === "staff" ? "Coaches and admins only" : "No messages yet"}
                  </span>
                </span>
                {c.unread > 0 && !c.muted && <span className="nbadge">{c.unread > 99 ? "99+" : c.unread}</span>}
                {c.muted && <span className="chat-muted" title="Muted">🔕</span>}
              </button>
            </li>
          ))}
        </ul>
        {!chats.length && <p className="muted chat-empty">No chats yet. Team chats appear once you&apos;re in a team.</p>}
        <p className="chat-safe">
          Keeping it safe: players can&apos;t send or receive private messages, team chats can be read by club admins, and coaches can remove messages.
        </p>
      </aside>
      <section className="chat-conv" aria-label="Conversation">
        {current ? <Conversation key={current.id} chat={current} onBack={() => setOpenId(null)} onChanged={reload} /> : <p className="muted chat-pick">Choose a chat.</p>}
      </section>
    </div>
  );
}

function ContactPicker({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, supabase, toast } = useApp();
  const [list, setList] = useState<Contact[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    supabase.rpc("chat_contacts", { p_club: data.club.id }).then(({ data: rows, error }) => {
      if (error) toast(errMsg(error));
      setList((rows ?? []) as Contact[]);
    });
  }, [supabase, data.club.id, toast]);
  async function start(c: Contact) {
    const { data: id, error } = await supabase.rpc("open_direct_chat", { p_club: data.club.id, p_user: c.user_id });
    if (error) return toast(errMsg(error));
    onOpen(id as string);
  }
  const shown = (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="chat-picker">
      <input className="input" autoFocus placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      {list === null ? (
        <p className="muted">Loading…</p>
      ) : shown.length ? (
        <ul>
          {shown.map((c) => (
            <li key={c.user_id}>
              <button type="button" onClick={() => start(c)}>
                <b>{c.name}</b> <small>{ROLES[c.role]}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No one to message yet.</p>
      )}
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        {data.role === "parent" ? "You can message coaches and the club." : "Private messages are between adults only. Players are reached through the team chat."}
      </p>
    </div>
  );
}

function Conversation({ chat, onBack, onChanged }: { chat: ChatSummary; onBack: () => void; onChanged: () => void }) {
  const { data, supabase, toast, patch, isAdmin, manages } = useApp();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [more, setMore] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(chat.muted);
  const [posting, setPosting] = useState(chat.posting);
  const box = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const staffRole = data.role === "admin" || data.role === "coach" || data.role === "assistant";
  const moderator = isAdmin || (chat.kind === "team" && staffRole && manages(chat.team_id)) || (chat.kind === "staff" && staffRole);
  const canPost = posting === "all" || moderator;
  const roleOf = useMemo(() => new Map(data.members.map((m) => [m.user_id, m.role])), [data.members]);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id,channel_id,author_id,author_name,body,created_at,deleted_at,deleted_by_name")
      .eq("channel_id", chat.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (error) return;
    const list = (rows ?? []) as Msg[];
    setMore(list.length > limit);
    setMsgs(list.slice(0, limit).reverse());
  }, [supabase, chat.id, limit]);

  // Mark as read: the chat, and its notification in the inbox.
  const markRead = useCallback(async () => {
    const now = new Date().toISOString();
    await supabase.from("chat_reads").upsert({ channel_id: chat.id, user_id: data.userId, last_read_at: now, muted }, { onConflict: "channel_id,user_id" });
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", data.userId).eq("dedupe", `chat:${chat.id}`).is("read_at", null);
    patch((d) => ({
      ...d,
      chats: d.chats.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c)),
      notifications: d.notifications.map((n) => (n.url === `/chat?c=${chat.id}` && !n.read_at ? { ...n, read_at: now } : n)),
    }));
  }, [supabase, chat.id, data.userId, muted, patch]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => clearInterval(t);
  }, [load]);
  const lastId = msgs?.[msgs.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    markRead();
    if (nearBottom.current && box.current) box.current.scrollTop = box.current.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    // Clear the box straight away so the next message can be typed; put the text back if sending fails.
    setText("");
    setBusy(true);
    const { error } = await supabase.from("chat_messages").insert({ channel_id: chat.id, body });
    setBusy(false);
    if (error) {
      setText((t) => t || body);
      return toast(errMsg(error));
    }
    nearBottom.current = true;
    pingPush();
    await load();
    onChanged();
  }
  async function remove(m: Msg) {
    const { error } = await supabase.rpc("delete_chat_message", { p_id: m.id });
    if (error) return toast(errMsg(error));
    load();
  }
  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    const { error } = await supabase.from("chat_reads").upsert({ channel_id: chat.id, user_id: data.userId, muted: next }, { onConflict: "channel_id,user_id" });
    if (error) {
      setMuted(!next);
      return toast(errMsg(error));
    }
    toast(next ? "Muted: no notifications from this chat" : "Notifications on for this chat");
    onChanged();
  }
  async function togglePosting() {
    const next = posting === "all" ? "staff" : "all";
    const { error } = await supabase.from("chat_channels").update({ posting: next }).eq("id", chat.id);
    if (error) return toast(errMsg(error));
    setPosting(next);
    toast(next === "staff" ? "Only coaches can post now" : "Everyone can post now");
  }

  const title = chat.kind === "team" ? `${chat.name} team chat` : chat.name;
  const who =
    chat.kind === "team"
      ? `Coaches, parents and players${posting === "staff" ? " · only coaches can post" : ""}`
      : chat.kind === "staff"
        ? "Admins, head coaches and assistant coaches"
        : "Private message";

  let lastDay = "";
  return (
    <>
      <header className="chat-head">
        <button type="button" className="icon-btn chat-back" onClick={onBack} aria-label="Back to chats">
          ‹
        </button>
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          <small>{who}</small>
        </div>
        <div className="chat-head-actions">
          {moderator && chat.kind === "team" && (
            <button type="button" className="btn sm" onClick={togglePosting}>
              {posting === "all" ? "Coaches only" : "Let everyone post"}
            </button>
          )}
          <button type="button" className="btn sm" onClick={toggleMute} aria-pressed={muted}>
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      </header>
      <div
        className="chat-msgs"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {more && (
          <button type="button" className="btn sm chat-older" onClick={() => setLimit((l) => l + PAGE)}>
            Show older messages
          </button>
        )}
        {msgs === null ? (
          <p className="muted">Loading…</p>
        ) : msgs.length === 0 ? (
          <p className="muted chat-pick">No messages yet. Say hello!</p>
        ) : (
          msgs.map((m) => {
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.author_id === data.userId;
            const role = m.author_id ? roleOf.get(m.author_id) : undefined;
            return (
              <div key={m.id}>
                {showDay && <div className="chat-day">{day}</div>}
                <div className={`chat-msg${mine ? " mine" : ""}${m.deleted_at ? " gone" : ""}`}>
                  {!mine && chat.kind !== "direct" && (
                    <span className="chat-author">
                      {m.author_name}
                      {role && <small>{ROLES[role]}</small>}
                    </span>
                  )}
                  <div className="chat-bubble">
                    {m.deleted_at ? <i>Message removed{m.deleted_by_name ? ` by ${m.deleted_by_name}` : ""}</i> : <Linkify text={m.body} />}
                  </div>
                  <span className="chat-meta">
                    {time(m.created_at)}
                    {!m.deleted_at && (mine || moderator) && (
                      <button type="button" className="linklike" onClick={() => remove(m)}>
                        Remove
                      </button>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      {canPost ? (
        <form className="chat-compose" onSubmit={send}>
          <textarea
            className="input"
            rows={1}
            maxLength={2000}
            placeholder="Write a message"
            aria-label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" type="submit" disabled={busy || !text.trim()}>
            Send
          </button>
        </form>
      ) : (
        <p className="chat-readonly">Only coaches can post in this chat.</p>
      )}
    </>
  );
}
