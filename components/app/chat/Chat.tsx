"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function Chat() {
  const { data, supabase, patch } = useApp();
  const [chats, setChats] = useState<ChatSummary[]>(data.chats);
  useEffect(() => setChats(data.chats), [data.chats]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const staff = data.role === "admin" || data.role === "coach" || data.role === "assistant";

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
        <p>
          {data.chatMinAge > 0 ? `Team chat is for players aged ${data.chatMinAge} and over.` : "Chat isn't available on your account yet: ask your club to link it to your player profile."} Your parents can
          see the team chat and will pass on anything you need to know.
        </p>
      </div>
    );

  const current = chats.find((c) => c.id === openId) ?? null;
  const canDM = data.role !== "player";

  return (
    <div className="chat" data-open={openId ? "conv" : "list"}>
      <aside className="chat-list" aria-label="Chats">
        <div className="chat-list-head">
          <h1>Chat</h1>
          <div className="chat-list-actions">
            {staff && (
              <button className="btn sm" onClick={() => (setGrouping(!grouping), setPicking(false))} aria-expanded={grouping}>
                New group
              </button>
            )}
            {canDM && (
              <button className="btn sm" onClick={() => (setPicking(!picking), setGrouping(false))} aria-expanded={picking}>
                New message
              </button>
            )}
          </div>
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
          {chats.map((c) => (
            <li key={c.id}>
              <button type="button" aria-current={c.id === openId || undefined} onClick={() => setOpenId(c.id)}>
                <span className={`chat-av ${c.kind}`} aria-hidden="true">
                  {c.kind === "direct" || c.kind === "group" ? initials(c.name) : c.kind === "staff" ? "ST" : "TM"}
                </span>
                <span className="chat-li-main">
                  <span className="chat-li-top">
                    <b>{c.kind === "team" ? `${c.name} team` : c.name}</b>
                    <small>{ago(c.last_at)}</small>
                  </span>
                  <span className="chat-li-last">
                    {c.last_body ? (c.kind === "direct" ? c.last_body : `${(c.last_author ?? "").split(" ")[0]}: ${c.last_body}`) : c.kind === "team" ? "Team chat" : c.kind === "staff" ? "Coaches and admins only" : c.kind === "group" ? "Group chat" : "No messages yet"}
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
        {current ? (
          <Conversation
            key={current.id}
            chat={current}
            onBack={() => setOpenId(null)}
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

function Conversation({ chat, onBack, onChanged, onLeft }: { chat: ChatSummary; onBack: () => void; onChanged: () => void; onLeft: () => void }) {
  const { data, supabase, toast, patch, isAdmin, manages } = useApp();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const staffRole = data.role === "admin" || data.role === "coach" || data.role === "assistant";
  const moderator = isAdmin || (chat.kind === "team" && staffRole && manages(chat.team_id)) || ((chat.kind === "staff" || chat.kind === "group") && staffRole);
  const canPost = data.chatCanSend && (posting === "all" || moderator);
  const roleOf = useMemo(() => new Map(data.members.map((m) => [m.user_id, m.role])), [data.members]);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id,channel_id,author_id,author_name,body,created_at,deleted_at,deleted_by_name,image_path,image_w,image_h")
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
    const { error } = await supabase.from("chat_messages").insert({ channel_id: chat.id, body, ...(image ?? {}) });
    setBusy(false);
    if (error) {
      setText((t) => t || body);
      return toast(errMsg(error));
    }
    setPending(null);
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
  if (showMembers && chat.kind === "group")
    return <GroupMembers chat={chat} moderator={moderator} onClose={() => setShowMembers(false)} onLeft={onLeft} onChanged={onChanged} />;
  const who =
    chat.kind === "team"
      ? `Coaches, parents and players${posting === "staff" ? " · only coaches can post" : ""}`
      : chat.kind === "staff"
        ? "Admins, head coaches and assistant coaches"
        : chat.kind === "group"
          ? "Group chat"
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
          {chat.kind === "group" && (
            <button type="button" className="btn sm" onClick={() => setShowMembers(true)}>
              Members
            </button>
          )}
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
                  {(m.deleted_at || m.body) && (
                    <div className="chat-bubble">
                      {m.deleted_at ? <i>Message removed{m.deleted_by_name ? ` by ${m.deleted_by_name}` : ""}</i> : <Linkify text={m.body} />}
                    </div>
                  )}
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
      {big && (
        <div className="chat-lightbox" role="dialog" aria-label="Picture" onClick={() => setBig(null)} onKeyDown={(e) => e.key === "Escape" && setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" />
          <button type="button" className="icon-btn" autoFocus onClick={() => setBig(null)} aria-label="Close">
            ✕
          </button>
        </div>
      )}
      {canPost && pending && (
        <div className="chat-pending">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.preview} alt="Picture to send" />
          <span>{pending.ext === "gif" ? "GIF" : "Picture"} ready to send. Add a message if you like.</span>
          <button type="button" className="icon-btn" onClick={() => setPending(null)} aria-label="Remove picture">
            ✕
          </button>
        </div>
      )}
      {canPost ? (
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
          <button type="button" className="btn chat-attach" onClick={() => fileInput.current?.click()} aria-label="Add a picture, screenshot or GIF" title="Add a picture or GIF">
            📎
          </button>
          <textarea
            className="input"
            rows={1}
            maxLength={2000}
            placeholder="Write a message"
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
            }}
          />
          <button className="btn primary" type="submit" disabled={busy || (!text.trim() && !pending)}>
            Send
          </button>
        </form>
      ) : (
        <p className="chat-readonly">{data.chatCanSend ? "Only coaches can post in this chat." : "You can read the team chat. Coaches and parents send the messages."}</p>
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
              <span className="chat-av direct" aria-hidden="true">
                {initials(m.name)}
              </span>
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
