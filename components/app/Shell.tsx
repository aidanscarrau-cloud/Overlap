"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { SheetHost } from "./sheets/SheetHost";
import { ROLES } from "@/lib/constants";
import { initials } from "@/lib/format";
import { Crest } from "@/components/ui";

const NAV = [
  { href: "/", label: "Home", short: "Home", icon: "i-home" },
  { href: "/sessions", label: "Schedule", short: "Schedule", icon: "i-cal" },
  { href: "/squad", label: "Squad", short: "Squad", icon: "i-squad" },
  { href: "/chat", label: "Chat", short: "Chat", icon: "i-chat" },
  { href: "/development", label: "Development", short: "Development", icon: "i-target" },
  { href: "/announcements", label: "Announcements", short: "News", icon: "i-megaphone" },
  { href: "/drills", label: "Drill library", short: "Drills", icon: "i-board" },
  { href: "/club", label: "Club & members", short: "Club", icon: "i-people" },
];

// Players and parents get a short, plain menu; nothing they don't need.
const FAMILY_NAV = [
  { href: "/", label: "Home", short: "Home", icon: "i-home" },
  { href: "/sessions", label: "Schedule", short: "Schedule", icon: "i-cal" },
  { href: "/development", label: "My plan", short: "My plan", icon: "i-target" },
  { href: "/chat", label: "Chat", short: "Chat", icon: "i-chat" },
  { href: "/announcements", label: "News", short: "News", icon: "i-megaphone" },
  { href: "/club", label: "Account", short: "Account", icon: "i-people" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { data, team, setTeam, unread } = useApp();
  const family = data.role === "player" || data.role === "parent";
  // Player accounts under the club's chat age don't get chat at all.
  const nav = (family ? FAMILY_NAV : NAV).filter((n) => n.href !== "/chat" || data.chatAllowed);
  const chatUnread = data.chats.filter((c) => !c.muted).reduce((s, c) => s + c.unread, 0);
  const path = usePathname();
  const router = useRouter();
  const isSchedule = path.startsWith("/sessions") || path.startsWith("/matches");
  const active = (href: string) => (href === "/" ? path === "/" : href === "/sessions" ? isSchedule : path.startsWith(href));
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  // Phone menu: the four places people use most, the rest under More.
  // Families reach Account from the avatar at the top; coaches find Development and the rest under More.
  const PHONE = ["/", "/sessions", family ? "/development" : "/squad", "/chat"];
  const moreItems = nav.filter((n) => !PHONE.includes(n.href));

  function switchClub(id: string) {
    if (id === "__new") return router.push("/onboarding");
    document.cookie = `overlap-club=${id}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = "overlap-team=; path=/; max-age=0";
    router.refresh();
  }

  const teamSelect = (id: string, cls = "") =>
    data.teams.length ? (
      <select className={`tsel ${cls}`} id={id} aria-label="Team" value={team?.id ?? ""} onChange={(e) => setTeam(e.target.value)}>
        {data.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className="app">
      <aside className="side" aria-label="Main">
        <div className="clubbox">
          <div className="clubrow">
            <Crest url={data.club.logo_url} />
            <div style={{ minWidth: 0 }}>
              <b>{data.club.name}</b>
              <span className="role-pill">{ROLES[data.role]}</span>
            </div>
          </div>
          {data.clubs.length > 1 && (
            <select className="tsel" aria-label="Club" value={data.club.id} onChange={(e) => switchClub(e.target.value)}>
              {data.clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">Enter an invite code…</option>
            </select>
          )}
          {data.teams.length > 0 && (
            <>
              <label className="eyebrow" htmlFor="team-select" style={{ color: "var(--on-navy-muted)" }}>
                Team
              </label>
              {teamSelect("team-select")}
            </>
          )}
        </div>
        <nav className="snav" aria-label="Sections">
          <Link href="/notifications" prefetch aria-current={active("/notifications") ? "page" : undefined}>
            <svg className="i">
              <use href="#i-bell" />
            </svg>
            Notifications
            {unread > 0 && <span className="nbadge">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          {!family && <div className="lbl">Club hub</div>}
          {nav.map((n) => (
            <Link key={n.href} href={n.href} prefetch aria-current={active(n.href) ? "page" : undefined}>
              <svg className="i">
                <use href={`#${n.icon}`} />
              </svg>
              {n.label}
              {n.href === "/chat" && chatUnread > 0 && <span className="nbadge">{chatUnread > 99 ? "99+" : chatUnread}</span>}
            </Link>
          ))}
        </nav>
        <div className="coach">
          <div className="av">{initials(data.myName)}</div>
          <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
            <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.myName}</b>
            <form action="/auth/signout" method="post">
              <button className="signout" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
        {data.clubs.length === 1 && (
          <Link href="/onboarding" style={{ fontSize: 13, color: "var(--on-navy-muted)" }}>
            Enter an invite code
          </Link>
        )}
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="mtop">
          <div className="mtop-club">
            <Crest url={data.club.logo_url} size={34} />
            <div className="mtop-names">
              <small>{data.club.name}</small>
              {data.teams.length ? teamSelect("team-select-m", "mtop-team") : <b>{ROLES[data.role]}</b>}
            </div>
          </div>
          <Bell unread={unread} />
          <Link className="av" href="/club#account" aria-label={`Your account: ${data.myName}`} style={{ textDecoration: "none" }}>
            {initials(data.myName)}
          </Link>
        </header>
        <main id="main">
          {isSchedule && <ScheduleSwitch path={path} />}
          {children}
        </main>
      </div>

      {more && (
        <div className="sheet-scrim" onClick={() => setMore(false)}>
          <div className="more-sheet" role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <span className="grab" aria-hidden="true" />
            <div className="more-me">
              <div className="av">{initials(data.myName)}</div>
              <div style={{ minWidth: 0 }}>
                <b>{data.myName}</b>
                <small>{ROLES[data.role]} · {data.club.name}</small>
              </div>
            </div>
            <div className="more-grid">
              {[...moreItems, { href: "/notifications", label: "Notifications", short: "", icon: "i-bell" }].map((n) => (
                <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} onClick={() => setMore(false)}>
                  <span className="more-ic">
                    <svg className="i">
                      <use href={`#${n.icon}`} />
                    </svg>
                  </span>
                  {n.label}
                </Link>
              ))}
            </div>
            {data.clubs.length > 1 && (
              <select className="tsel" aria-label="Club" value={data.club.id} onChange={(e) => switchClub(e.target.value)}>
                {data.clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new">Enter an invite code…</option>
              </select>
            )}
            <form action="/auth/signout" method="post">
              <button className="btn more-out" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
      <nav className="bnav" aria-label="Sections">
        {nav.filter((n) => PHONE.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} prefetch aria-current={active(n.href) ? "page" : undefined}>
            <svg className="i">
              <use href={`#${n.icon}`} />
            </svg>
            {n.short}
            {n.href === "/chat" && chatUnread > 0 && <span className="nbadge bnav-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
          </Link>
        ))}
        {moreItems.length > 0 && (
        <button type="button" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore(!more)} aria-current={moreItems.some((n) => active(n.href)) || more ? "page" : undefined}>
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
          </svg>
          More
        </button>
        )}
      </nav>
      <SheetHost />
    </div>
  );
}

function Bell({ unread }: { unread: number }) {
  return (
    <Link className="bell" href="/notifications" prefetch aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
      <svg className="i" aria-hidden="true">
        <use href="#i-bell" />
      </svg>
      {unread > 0 && <span className="nbadge">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}

function ScheduleSwitch({ path }: { path: string }) {
  const m = path.startsWith("/matches");
  return (
    <div className="sched-switch" role="tablist" aria-label="Schedule">
      <Link href="/sessions" role="tab" aria-selected={!m} prefetch>
        Training
      </Link>
      <Link href="/matches" role="tab" aria-selected={m} prefetch>
        Matches
      </Link>
    </div>
  );
}
