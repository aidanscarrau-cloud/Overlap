"use client";

import { Avatar } from "../Avatar";
import { Empty } from "../Empty";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "../AppProvider";
import { Linkify } from "@/components/Linkify";
import { pingPush } from "@/lib/push-client";
import { ROLES } from "@/lib/constants";
import { errMsg, initials } from "@/lib/format";
import type { ChatSummary, Role } from "@/lib/types";

type Msg = {
  id: string;
  channel_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by_name: string | null;
  image_path?: string | null;
  image_w?: number | null;
  image_h?: number | null;
  reply_to?: string | null;
};
type Pending = { blob: Blob; preview: string; w: number; h: number; ext: string; type: string };
const MAX_BYTES = 8 * 1024 * 1024;

/** Photos and screenshots are shrunk before upload (max 1600 px); GIFs are kept as they are so they still move. */
async function prepareImage(file: File): Promise<Pending> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture.");
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => bad(new Error("Couldn't read that picture."));
    i.src = url;
  });
  if (file.type === "image/gif") {
    if (file.size > MAX_BYTES) throw new Error("That GIF is over 8 MB. Try a smaller one.");
    return { blob: file, preview: url, w: img.naturalWidth, h: img.naturalHeight, ext: "gif", type: "image/gif" };
  }
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q));
  let blob = await toBlob("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);
  if (!blob) throw new Error("Couldn't prepare that picture.");
  if (blob.size > MAX_BYTES) throw new Error("That picture is too big.");
  const type = blob.type;
  return { blob, preview: URL.createObjectURL(blob), w, h, ext: type === "image/webp" ? "webp" : "jpg", type };
}
type Contact = { user_id: string; name: string; role: Role; teams?: string };
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

/**
 * iPhones don't shrink the page when the keyboard opens; they slide it up, which pushes a full-screen chat's
 * top bar off the screen and can hide the message box. Keep the open conversation exactly inside the part of
 * the screen that's still visible, and stop the page behind it from scrolling.
 */
function useKeyboardSafe(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el || !active || !window.matchMedia("(max-width: 860px)").matches) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const fit = () => {
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
      el.style.bottom = "auto";
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      el.style.height = "";
      el.style.top = "";
      el.style.bottom = "";
      html.style.overflow = prev;
    };
  }, [ref, active]);
}

export function Chat() {
  const { data, supabase, patch } = useApp();
  const [chats, setChats] = useState<ChatSummary[]>(data.chats);
  useEffect(() => setChats(data.chats), [data.chats]);
  // Opened from a link (a player's "Message" button or a notification): start on that chat straight away,
  // so the list doesn't flash first, and let Back return to where they came from.
  const linked = useSearchParams().get("c");
  const [openId, setOpenId] = useState<string | null>(linked);
  const [linkedId] = useState(linked); // kept: the address is tidied to /chat once open
  const router = useRouter();
  const convRef = useRef<HTMLElement>(null);
  useKeyboardSafe(convRef, !!openId);
  const [picking, setPicking] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "teams" | "people">("all");
  const staff = data.role === "admin" || data.role === "coach" || data.role === "assistant";

  // Open a chat from a notification link (?c=<id>), or the first chat on wide screens.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) {
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
        <p>
          {data.chatMinAge > 0 ? `Team chat is for players aged ${data.chatMinAge} and over.` : "Chat isn't available on your account yet: ask your club to link it to your player profile."} Your parents can
          see the team chat and will pass on anything you need to know.
        </p>
      </div>
    );

  const current = chats.find((c) => c.id === openId) ?? null;
  const canDM = data.role !== "player";
  const ql = q.trim().toLowerCase();
  const shown = chats.filter(
    (c) =>
      (filter === "all" || (filter === "unread" ? c.unread > 0 : filter === "teams" ? c.kind === "team" || c.kind === "staff" : c.kind === "group" || c.kind === "direct")) &&
      (!ql || c.name.toLowerCase().includes(ql) || (c.last_body ?? "").toLowerCase().includes(ql)),
  );
  const unreadChats = chats.filter((c) => c.unread > 0 && !c.muted).length;

  return (
    <div className="chat" data-open={openId ? "conv" : "list"}>
      <aside className="chat-list" aria-label="Chats">
        <div className="chat-list-head">
          <h1>Chats</h1>
          <div className="chat-list-actions">
            {staff && (
              <button className="round-btn" onClick={() => (setGrouping(!grouping), setPicking(false))} aria-expanded={grouping} aria-label="New group" title="New group">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
                  <path d="M18 8v6M15 11h6" />
                </svg>
              </button>
            )}
            {canDM && (
              <button className="round-btn accent" onClick={() => (setPicking(!picking), setGrouping(false))} aria-expanded={picking} aria-label="New message" title="New message">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20l1.2-4.2L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.2 18.8z" />
                  <path d="M13.5 7.5l3 3" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="chat-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
        </div>
        <div className="chat-filters" role="tablist" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["unread", unreadChats ? `Unread ${unreadChats}` : "Unread"],
              ["teams", "Teams"],
              ["people", "Groups & people"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        {grouping && (
          <GroupCreator
            onCancel={() => setGrouping(false)}
            onOpen={async (id) => {
              setGrouping(false);
              await reload();
              setOpenId(id);
            }}
          />
        )}
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
          {shown.map((c) => {
            const hot = c.unread > 0 && !c.muted;
            return (
              <li key={c.id}>
                <button type="button" aria-current={c.id === openId || undefined} onClick={() => setOpenId(c.id)}>
                  <ChatAvatar chat={c} />
                  <span className="chat-li-main">
                    <span className="chat-li-top">
                      <b>{c.kind === "team" ? `${c.name} team` : c.name}</b>
                      <small className={hot ? "hot" : undefined}>{ago(c.last_at)}</small>
                    </span>
                    <span className="chat-li-bottom">
                      <span className={`chat-li-last${hot ? " hot" : ""}`}>
                        {c.last_body ? (c.kind === "direct" ? c.last_body : `${(c.last_author ?? "").split(" ")[0]}: ${c.last_body}`) : c.kind === "team" ? "Team chat" : c.kind === "staff" ? "Coaches and admins only" : c.kind === "group" ? "Group chat" : "No messages yet"}
                      </span>
                      {c.muted && (
                        <span className="chat-muted" title="Muted" aria-label="Muted">
                          🔕
                        </span>
                      )}
                      {hot && <span className="chat-count">{c.unread > 99 ? "99+" : c.unread}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {chats.length > 0 && !shown.length && <p className="muted chat-empty">{filter === "unread" ? "You're all caught up." : "No chats match."}</p>}
        {!chats.length && (
          <div style={{ padding: 16 }}>
            <Empty icon="i-chat" title="No chats yet" text="Your team's chat appears here once you're in a team." compact />
          </div>
        )}
        <p className="chat-safe">
          Keeping it safe: players can&apos;t send or receive private messages, team chats can be read by club admins, and coaches can remove messages.
        </p>
      </aside>
      <section className="chat-conv" aria-label="Conversation" ref={convRef}>
        {current ? (
          <Conversation
            key={current.id}
            chat={current}
            onBack={() => {
              // Came from a player's profile or a notification: go back there, like a phone's back button.
              if (linkedId && current.id === linkedId && window.history.length > 1) router.back();
              else setOpenId(null);
            }}
            onChanged={reload}
            onLeft={async () => {
              setOpenId(null);
              await reload();
            }}
          />
        ) : (
          <p className="muted chat-pick">Choose a chat.</p>
        )}
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

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "⚽", "👏"];
const NAME_COLOURS = ["#c2410c", "#0f766e", "#7c3aed", "#be185d", "#1d4ed8", "#15803d", "#a16207", "#0e7490"];
const hashOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
const nameColour = (key: string) => NAME_COLOURS[Math.abs(hashOf(key)) % NAME_COLOURS.length];
type Reaction = { message_id: string; user_id: string; emoji: string };
const snippet = (m: Msg) => (m.deleted_at ? "Message removed" : m.body ? m.body.slice(0, 120) : m.image_path ? "📷 Photo" : "");

export function ChatAvatar({ chat }: { chat: ChatSummary }) {
  if (chat.kind === "team" || chat.kind === "staff")
    return (
      <span className={`chat-av ${chat.kind}`} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          {chat.kind === "team" ? (
            <>
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
              <circle cx="17" cy="9" r="2.6" />
              <path d="M16 14.2c2.4.2 4 1.8 4.5 4.8" />
            </>
          ) : (
            <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6z" />
          )}
        </svg>
      </span>
    );
  return (
    <Avatar userId={chat.kind === "direct" ? chat.other_user : null} name={chat.name} className={`chat-av ${chat.kind}`} style={{ background: nameColour(chat.name) }} />
  );
}

function Conversation({ chat, onBack, onChanged, onLeft }: { chat: ChatSummary; onBack: () => void; onChanged: () => void; onLeft: () => void }) {
  const { data, supabase, toast, patch, isAdmin, manages } = useApp();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [reacts, setReacts] = useState<Reaction[]>([]);
  const [reactOk, setReactOk] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [more, setMore] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(chat.muted);
  const [posting, setPosting] = useState(chat.posting);
  const [showMembers, setShowMembers] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [big, setBig] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [menu, setMenu] = useState<Msg | null>(null);
  const [opts, setOpts] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const staffRole = data.role === "admin" || data.role === "coach" || data.role === "assistant";
  const moderator = isAdmin || (chat.kind === "team" && staffRole && manages(chat.team_id)) || ((chat.kind === "staff" || chat.kind === "group") && staffRole);
  const canPost = data.chatCanSend && (posting === "all" || moderator);
  const canReact = data.chatCanSend && reactOk;
  const roleOf = useMemo(() => new Map(data.members.map((m) => [m.user_id, m.role])), [data.members]);
  const nameOf = useMemo(() => new Map(data.members.map((m) => [m.user_id, m.full_name])), [data.members]);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id,channel_id,author_id,author_name,body,created_at,deleted_at,deleted_by_name,image_path,image_w,image_h,reply_to")
      .eq("channel_id", chat.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    let list = (rows ?? []) as Msg[];
    if (error) {
      // Before the replies update is run: load without reply_to.
      const old = await supabase
        .from("chat_messages")
        .select("id,channel_id,author_id,author_name,body,created_at,deleted_at,deleted_by_name,image_path,image_w,image_h")
        .eq("channel_id", chat.id)
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (old.error) return;
      list = (old.data ?? []) as Msg[];
    }
    setMore(list.length > limit);
    const shown = list.slice(0, limit).reverse();
    setMsgs(shown);
    const r = await supabase.from("chat_reactions").select("message_id,user_id,emoji").eq("channel_id", chat.id).in("message_id", shown.map((m) => m.id).slice(-200));
    if (r.error) setReactOk(false);
    else setReacts((r.data ?? []) as Reaction[]);
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

  // A new reaction on the last messages shouldn't hide under the message box.
  useEffect(() => {
    if (nearBottom.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [reacts.length]);

  // Short-lived links for the pictures on screen (the bucket is private).
  useEffect(() => {
    const need = (msgs ?? []).map((m) => m.image_path).filter((p): p is string => !!p && !urls.has(p));
    if (!need.length) return;
    supabase.storage
      .from("chat")
      .createSignedUrls(need, 3600)
      .then(({ data: signed }) => {
        if (!signed) return;
        setUrls((prev) => {
          const n = new Map(prev);
          signed.forEach((x) => x.path && x.signedUrl && n.set(x.path, x.signedUrl));
          return n;
        });
      });
  }, [msgs, urls, supabase]);

  async function pick(file: File | undefined | null) {
    if (!file) return;
    try {
      setPending(await prepareImage(file));
    } catch (err) {
      toast(errMsg(err));
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !pending) || busy) return;
    // Clear the box straight away so the next message can be typed; put the text back if sending fails.
    setText("");
    setBusy(true);
    let image: { image_path: string; image_w: number; image_h: number } | null = null;
    if (pending) {
      const path = `${data.club.id}/${chat.id}/${crypto.randomUUID()}.${pending.ext}`;
      const up = await supabase.storage.from("chat").upload(path, pending.blob, { contentType: pending.type, upsert: false });
      if (up.error) {
        setBusy(false);
        setText((t) => t || body);
        return toast(errMsg(up.error));
      }
      image = { image_path: path, image_w: pending.w, image_h: pending.h };
      setUrls((prev) => new Map(prev).set(path, pending.preview));
    }
    const { error } = await supabase.from("chat_messages").insert({ channel_id: chat.id, body, ...(image ?? {}), ...(replyTo ? { reply_to: replyTo.id } : {}) });
    setBusy(false);
    if (error) {
      setText((t) => t || body);
      return toast(errMsg(error));
    }
    setPending(null);
    setReplyTo(null);
    nearBottom.current = true;
    pingPush();
    await load();
    onChanged();
  }
  async function remove(m: Msg) {
    setMenu(null);
    const { error } = await supabase.rpc("delete_chat_message", { p_id: m.id });
    if (error) return toast(errMsg(error));
    load();
  }
  async function react(m: Msg, emoji: string) {
    setMenu(null);
    const mineNow = reacts.find((r) => r.message_id === m.id && r.user_id === data.userId);
    // Show it straight away; the poll corrects anything that didn't stick.
    setReacts((rs) => {
      const rest = rs.filter((r) => !(r.message_id === m.id && r.user_id === data.userId));
      return mineNow?.emoji === emoji ? rest : [...rest, { message_id: m.id, user_id: data.userId, emoji }];
    });
    const { error } = await supabase.rpc("react_to_message", { p_message: m.id, p_emoji: emoji });
    if (error) {
      toast(errMsg(error));
      load();
    }
  }
  function startReply(m: Msg) {
    setMenu(null);
    setReplyTo(m);
    setTimeout(() => textRef.current?.focus(), 30);
  }
  function jumpTo(id: string) {
    const el = document.getElementById(`m-${id}`);
    if (!el) return toast("That message is further back. Tap 'Show older messages'.");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash(null), 1400);
  }
  async function toggleMute() {
    setOpts(false);
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
    setOpts(false);
    const next = posting === "all" ? "staff" : "all";
    const { error } = await supabase.from("chat_channels").update({ posting: next }).eq("id", chat.id);
    if (error) return toast(errMsg(error));
    setPosting(next);
    toast(next === "staff" ? "Only coaches can post now" : "Everyone can post now");
  }

  // Touch: swipe a message right to reply, hold it for reactions. Mouse: click it.
  const menuAt = useRef(0);
  const gesture = useRef<{ id: string; x: number; y: number; dx: number; el: HTMLElement; timer: number; held: boolean } | null>(null);
  function onDown(e: React.PointerEvent<HTMLDivElement>, m: Msg) {
    if (m.deleted_at || e.pointerType === "mouse") return;
    const el = e.currentTarget;
    const timer = window.setTimeout(() => {
      if (gesture.current && Math.abs(gesture.current.dx) < 8) {
        gesture.current.held = true;
        try {
          navigator.vibrate?.(12);
        } catch {}
        menuAt.current = Date.now();
        // Lifting the finger sends a click; don't let it land on the sheet that just opened.
        const swallow = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        document.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 900);
        setMenu(m);
      }
    }, 420);
    gesture.current = { id: m.id, x: e.clientX, y: e.clientY, dx: 0, el, timer, held: false };
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      clearTimeout(g.timer);
      g.el.style.transform = "";
      gesture.current = null;
      return;
    }
    g.dx = dx;
    if (dx > 6 && canPost) {
      clearTimeout(g.timer);
      g.el.style.transition = "none";
      g.el.style.transform = `translateX(${Math.min(dx, 84)}px)`;
      g.el.dataset.swipe = dx > 58 ? "go" : "on";
    }
  }
  function onUp(m: Msg) {
    const g = gesture.current;
    if (!g) return;
    clearTimeout(g.timer);
    g.el.style.transition = "";
    g.el.style.transform = "";
    delete g.el.dataset.swipe;
    if (g.dx > 58 && canPost) startReply(m);
    gesture.current = null;
  }

  const title = chat.kind === "team" ? `${chat.name} team` : chat.name;
  if (showMembers && chat.kind === "group")
    return <GroupMembers chat={chat} moderator={moderator} onClose={() => setShowMembers(false)} onLeft={onLeft} onChanged={onChanged} />;
  const who =
    chat.kind === "team"
      ? `Coaches, parents and players${posting === "staff" ? " · only coaches can post" : ""}`
      : chat.kind === "staff"
        ? "Admins, head coaches and assistant coaches"
        : chat.kind === "group"
          ? "Group chat · tap ⋯ for members"
          : "Private message";
  const byId = new Map((msgs ?? []).map((m) => [m.id, m]));
  const authorLabel = (m: Msg) => (m.author_id === data.userId ? "You" : m.author_name);

  let lastDay = "";
  return (
    <>
      <header className="chat-head">
        <button type="button" className="icon-btn chat-back" onClick={onBack} aria-label="Back to chats">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <ChatAvatar chat={chat} />
        <div className="chat-head-t">
          <h2>{title}</h2>
          <small>{muted ? "🔕 Muted · " : ""}{who}</small>
        </div>
        <div className="chat-opts">
          <button type="button" className="icon-btn" onClick={() => setOpts(!opts)} aria-expanded={opts} aria-label="Chat options">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5.5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="18.5" r="1.6" />
            </svg>
          </button>
          {opts && (
            <>
              <div className="chat-opts-scrim" onClick={() => setOpts(false)} />
              <div className="chat-opts-menu" role="menu">
                {chat.kind === "group" && (
                  <button role="menuitem" onClick={() => (setOpts(false), setShowMembers(true))}>
                    Members
                  </button>
                )}
                {moderator && chat.kind === "team" && (
                  <button role="menuitem" onClick={togglePosting}>
                    {posting === "all" ? "Only coaches can post" : "Let everyone post"}
                  </button>
                )}
                <button role="menuitem" onClick={toggleMute}>
                  {muted ? "Unmute notifications" : "Mute notifications"}
                </button>
              </div>
            </>
          )}
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
          <button type="button" className="chat-older" onClick={() => setLimit((l) => l + PAGE)}>
            Show older messages
          </button>
        )}
        {msgs === null ? (
          <div className="chat-skel" aria-label="Loading">
            <i />
            <i className="r" />
            <i />
          </div>
        ) : msgs.length === 0 ? (
          <p className="chat-hello">No messages yet. Say hello! 👋</p>
        ) : (
          msgs.map((m, i) => {
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.author_id === data.userId;
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const same = (a?: Msg, b?: Msg) =>
              !!a && !!b && a.author_id === b.author_id && dayLabel(a.created_at) === dayLabel(b.created_at) && Math.abs(+new Date(b.created_at) - +new Date(a.created_at)) < 5 * 60e3;
            const first = !same(prev, m) || showDay;
            const last = !same(m, next);
            const role = m.author_id ? roleOf.get(m.author_id) : undefined;
            const rs = reacts.filter((r) => r.message_id === m.id);
            const counts = REACTIONS.map((e) => [e, rs.filter((r) => r.emoji === e)] as const).filter(([, l]) => l.length);
            const quoted = m.reply_to ? byId.get(m.reply_to) : undefined;
            const onlyImage = !!m.image_path && !m.body && !m.deleted_at;
            const colour = nameColour(m.author_id ?? m.author_name);
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="chat-day">
                    <span>{day}</span>
                  </div>
                )}
                <div
                  id={`m-${m.id}`}
                  className={`chat-msg${mine ? " mine" : ""}${m.deleted_at ? " gone" : ""}${first ? " first" : ""}${last ? " last" : ""}${counts.length ? " has-r" : ""}${flash === m.id ? " flash" : ""}`}
                  onPointerDown={(e) => onDown(e, m)}
                  onPointerMove={onMove}
                  onPointerUp={() => onUp(m)}
                  onPointerCancel={() => onUp(m)}
                  onContextMenu={(e) => {
                    if (!m.deleted_at) {
                      e.preventDefault();
                      setMenu(m);
                    }
                  }}
                >
                  <span className="swipe-hint" aria-hidden="true">
                    ↩
                  </span>
                  <div
                    className={`chat-bubble${onlyImage ? " img-only" : ""}`}
                    onClick={(e) => {
                      if (m.deleted_at || (e.target as HTMLElement).closest("a,button")) return;
                      if (window.matchMedia("(pointer: fine)").matches) setMenu(m);
                    }}
                  >
                    {first && !mine && chat.kind !== "direct" && (
                      <span className="chat-author" style={{ color: colour }}>
                        {m.author_name}
                        {role && role !== "parent" && role !== "player" && <small>{ROLES[role].replace("Head coach", "Coach").replace("Assistant coach", "Assistant").replace("Club admin", "Admin")}</small>}
                      </span>
                    )}
                    {m.reply_to && !m.deleted_at && (
                      <button type="button" className="chat-quote" style={{ borderColor: quoted ? nameColour(quoted.author_id ?? quoted.author_name) : undefined }} onClick={() => jumpTo(m.reply_to!)}>
                        <b style={{ color: quoted ? nameColour(quoted.author_id ?? quoted.author_name) : undefined }}>{quoted ? authorLabel(quoted) : "Earlier message"}</b>
                        <span>{quoted ? snippet(quoted) : "Tap to find it"}</span>
                      </button>
                    )}
                    {!m.deleted_at && m.image_path && (
                      <button type="button" className="chat-img" onClick={() => urls.get(m.image_path!) && setBig(urls.get(m.image_path!)!)} aria-label={`Open picture from ${m.author_name}`}>
                        {urls.get(m.image_path) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={urls.get(m.image_path)} alt={`Picture from ${m.author_name}`} width={m.image_w ?? undefined} height={m.image_h ?? undefined} loading="lazy" />
                        ) : (
                          <span className="chat-img-wait" style={{ aspectRatio: `${m.image_w ?? 4} / ${m.image_h ?? 3}` }} />
                        )}
                      </button>
                    )}
                    {m.deleted_at ? (
                      <i className="chat-text">🚫 Message removed{m.deleted_by_name ? ` by ${m.deleted_by_name}` : ""}</i>
                    ) : m.body ? (
                      <span className="chat-text">
                        <Linkify text={m.body} />
                      </span>
                    ) : null}
                    <span className="chat-time">{time(m.created_at)}</span>
                  </div>
                  {counts.length > 0 && (
                    <div className="chat-reacts">
                      {counts.map(([e, l]) => (
                        <button
                          key={e}
                          type="button"
                          aria-pressed={l.some((r) => r.user_id === data.userId)}
                          disabled={!canReact}
                          onClick={() => react(m, e)}
                          title={l.map((r) => (r.user_id === data.userId ? "You" : nameOf.get(r.user_id) ?? "Member")).join(", ")}
                        >
                          {e}
                          {l.length > 1 && <b>{l.length}</b>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {menu && (
        <div className="sheet-scrim msg-scrim" onClick={() => Date.now() - menuAt.current > 500 && setMenu(null)}>
          <div className="msg-sheet" role="dialog" aria-label="Message options" onClick={(e) => e.stopPropagation()}>
            <span className="grab" aria-hidden="true" />
            <div className="msg-sheet-preview">
              <b>{authorLabel(menu)}</b>
              <span>{snippet(menu)}</span>
            </div>
            {canReact && (
              <div className="msg-emojis" role="group" aria-label="React">
                {REACTIONS.map((e) => (
                  <button key={e} type="button" aria-pressed={reacts.some((r) => r.message_id === menu.id && r.user_id === data.userId && r.emoji === e)} onClick={() => react(menu, e)} aria-label={`React ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            <div className="msg-actions">
              {canPost && (
                <button type="button" onClick={() => startReply(menu)}>
                  <span aria-hidden="true">↩</span> Reply
                </button>
              )}
              {menu.body && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(menu.body).then(() => toast("Copied"), () => {});
                    setMenu(null);
                  }}
                >
                  <span aria-hidden="true">⧉</span> Copy
                </button>
              )}
              {(menu.author_id === data.userId || moderator) && (
                <button type="button" className="danger" onClick={() => remove(menu)}>
                  <span aria-hidden="true">🗑</span> {menu.author_id === data.userId ? "Delete" : "Remove message"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {big && (
        <div className="chat-lightbox" role="dialog" aria-label="Picture" onClick={() => setBig(null)} onKeyDown={(e) => e.key === "Escape" && setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" />
          <button type="button" className="icon-btn" autoFocus onClick={() => setBig(null)} aria-label="Close">
            ✕
          </button>
        </div>
      )}
      {canPost ? (
        <div className="chat-bottom">
          {replyTo && (
            <div className="chat-replybar" style={{ borderColor: nameColour(replyTo.author_id ?? replyTo.author_name) }}>
              <div>
                <b style={{ color: nameColour(replyTo.author_id ?? replyTo.author_name) }}>Replying to {authorLabel(replyTo)}</b>
                <span>{snippet(replyTo)}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                ✕
              </button>
            </div>
          )}
          {pending && (
            <div className="chat-pending">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending.preview} alt="Picture to send" />
              <span>{pending.ext === "gif" ? "GIF" : "Picture"} ready. Add a message if you like.</span>
              <button type="button" className="icon-btn" onClick={() => setPending(null)} aria-label="Remove picture">
                ✕
              </button>
            </div>
          )}
          <form
            className="chat-compose"
            onSubmit={send}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
            <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
            <div className="compose-pill">
              <button type="button" className="compose-ic" onClick={() => fileInput.current?.click()} aria-label="Add a picture, screenshot or GIF" title="Add a picture or GIF">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <textarea
                ref={textRef}
                rows={1}
                maxLength={2000}
                placeholder="Message"
                aria-label="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
                  if (f) {
                    e.preventDefault();
                    pick(f);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
                    e.preventDefault();
                    send();
                  }
                  if (e.key === "Escape") setReplyTo(null);
                }}
              />
              {!text.trim() && !pending && (
                <button type="button" className="compose-ic" onClick={() => camInput.current?.click()} aria-label="Take a photo" title="Take a photo">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </button>
              )}
            </div>
            <button className="send-btn" type="submit" disabled={busy || (!text.trim() && !pending)} aria-label="Send">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.5 12L19.5 4.5 16 19.5l-4.2-5.8z" />
                <path d="M11.8 13.7L19.5 4.5" />
              </svg>
            </button>
          </form>
        </div>
      ) : (
        <p className="chat-readonly">{data.chatCanSend ? "Only coaches can post in this chat. You can still react to messages." : "You can read the team chat. Coaches and parents send the messages."}</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------ groups */

function PeoplePicker({ exclude, chosen, setChosen }: { exclude: Set<string>; chosen: Set<string>; setChosen: (s: Set<string>) => void }) {
  const { data, supabase, toast } = useApp();
  const [list, setList] = useState<Contact[] | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  useEffect(() => {
    supabase.rpc("chat_group_contacts", { p_club: data.club.id }).then(({ data: rows, error }) => {
      if (error) toast(errMsg(error));
      setList((rows ?? []) as Contact[]);
    });
  }, [supabase, data.club.id, toast]);
  const shown = (list ?? []).filter(
    (c) => !exclude.has(c.user_id) && (role === "all" || c.role === role || (role === "coach" && c.role === "assistant")) && (!q || (c.name + " " + (c.teams ?? "")).toLowerCase().includes(q.toLowerCase())),
  );
  const toggle = (id: string) => {
    const n = new Set(chosen);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setChosen(n);
  };
  return (
    <div className="people-pick">
      <div className="people-pick-filters">
        <input className="input" placeholder="Search name or team" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as "all" | Role)} aria-label="Role">
          <option value="all">Everyone</option>
          <option value="coach">Coaches</option>
          <option value="parent">Parents</option>
          <option value="player">Players</option>
          <option value="admin">Admins</option>
        </select>
      </div>
      {list === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {shown.length > 1 && (
            <button type="button" className="linklike" style={{ fontSize: 13 }} onClick={() => setChosen(new Set([...chosen, ...shown.map((c) => c.user_id)]))}>
              Select all {shown.length} shown
            </button>
          )}
          <ul>
            {shown.map((c) => (
              <li key={c.user_id}>
                <label>
                  <input type="checkbox" checked={chosen.has(c.user_id)} onChange={() => toggle(c.user_id)} />
                  <span>
                    <b>{c.name}</b> <small>{ROLES[c.role]}{c.teams ? ` · ${c.teams}` : ""}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!shown.length && <p className="muted">No one matches.</p>}
        </>
      )}
    </div>
  );
}

function GroupCreator({ onOpen, onCancel }: { onOpen: (id: string) => void; onCancel: () => void }) {
  const { data, supabase, toast } = useApp();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim()) return toast("Give the group a name.");
    if (!chosen.size) return toast("Add at least one person.");
    setBusy(true);
    const { data: id, error } = await supabase.rpc("create_group_chat", { p_club: data.club.id, p_name: name.trim(), p_members: [...chosen] });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Group created");
    onOpen(id as string);
  }
  return (
    <div className="chat-picker group-create">
      <input className="input" autoFocus maxLength={60} placeholder="Group name, e.g. Strikers or Saturday drivers" value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name" />
      <PeoplePicker exclude={new Set()} chosen={chosen} setChosen={setChosen} />
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Groups with players need at least two adults (you plus another coach or a parent), and club admins can see them.
      </p>
      <div className="sheet-actions">
        <button className="btn sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn sm primary" disabled={busy} onClick={create}>
          {busy ? "Creating…" : `Create group${chosen.size ? ` (${chosen.size + 1} people)` : ""}`}
        </button>
      </div>
    </div>
  );
}

type Member = { user_id: string; name: string; role: Role };

function GroupMembers({ chat, moderator, onClose, onLeft, onChanged }: { chat: ChatSummary; moderator: boolean; onClose: () => void; onLeft: () => void; onChanged: () => void }) {
  const { data, supabase, toast } = useApp();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [name, setName] = useState(chat.name);
  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.rpc("chat_members", { p_channel: chat.id });
    if (error) toast(errMsg(error));
    setMembers((rows ?? []) as Member[]);
  }, [supabase, chat.id, toast]);
  useEffect(() => {
    load();
  }, [load]);
  const inGroup = (members ?? []).some((m) => m.user_id === data.userId);

  async function remove(m: Member) {
    const { error } = await supabase.rpc("remove_group_member", { p_channel: chat.id, p_user: m.user_id });
    if (error) return toast(errMsg(error));
    if (m.user_id === data.userId) {
      toast("You left the group");
      return onLeft();
    }
    toast(`${m.name} removed`);
    load();
  }
  async function add() {
    if (!chosen.size) return;
    const { error } = await supabase.rpc("add_group_members", { p_channel: chat.id, p_members: [...chosen] });
    if (error) return toast(errMsg(error));
    toast(chosen.size === 1 ? "Added to the group" : `${chosen.size} people added`);
    setChosen(new Set());
    setAdding(false);
    load();
  }
  async function rename() {
    if (!name.trim() || name.trim() === chat.name) return;
    const { error } = await supabase.from("chat_channels").update({ name: name.trim() }).eq("id", chat.id);
    if (error) return toast(errMsg(error));
    toast("Group renamed");
    onChanged();
  }

  return (
    <>
      <header className="chat-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back to the conversation">
          ‹
        </button>
        <div style={{ minWidth: 0 }}>
          <h2>{chat.name}</h2>
          <small>{members ? `${members.length} people` : ""}</small>
        </div>
      </header>
      <div className="chat-msgs group-members">
        {moderator && (
          <form
            className="group-rename"
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <label className="field">
              <span>Group name</span>
              <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {name.trim() !== chat.name && (
              <button className="btn sm" type="submit">
                Rename
              </button>
            )}
          </form>
        )}
        {moderator &&
          (adding ? (
            <div className="group-add">
              <PeoplePicker exclude={new Set((members ?? []).map((m) => m.user_id))} chosen={chosen} setChosen={setChosen} />
              <div className="sheet-actions">
                <button className="btn sm" onClick={() => (setAdding(false), setChosen(new Set()))}>
                  Cancel
                </button>
                <button className="btn sm primary" disabled={!chosen.size} onClick={add}>
                  Add {chosen.size || ""}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setAdding(true)}>
              Add people
            </button>
          ))}
        <ul className="member-list">
          {(members ?? []).map((m) => (
            <li key={m.user_id}>
              <Avatar userId={m.user_id} name={m.name} className="chat-av direct" />
              <span>
                <b>{m.name}</b>
                {m.user_id === data.userId && <span className="muted"> (you)</span>}
                <small>{ROLES[m.role]}</small>
              </span>
              {m.user_id === data.userId ? (
                <button className="btn sm" onClick={() => remove(m)}>
                  Leave
                </button>
              ) : (
                moderator && (
                  <button className="btn sm danger" onClick={() => remove(m)}>
                    Remove
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
        {!inGroup && members && <p className="muted" style={{ fontSize: 13 }}>You can see this group because you&apos;re a club admin and it includes players.</p>}
      </div>
    </>
  );
}
