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
  { href: "/", label: "Overview", short: "Home", icon: "i-home" },
  { href: "/announcements", label: "Announcements", short: "News", icon: "i-megaphone" },
  { href: "/squad", label: "Squad", short: "Squad", icon: "i-squad" },
  { href: "/development", label: "Development", short: "IDPs", icon: "i-target" },
  { href: "/sessions", label: "Sessions", short: "Sessions", icon: "i-cal" },
  { href: "/drills", label: "Drill library", short: "Drills", icon: "i-board" },
  { href: "/club", label: "Club & members", short: "Club", icon: "i-people" },
];

// Players and parents get a short, plain menu; nothing they don't need.
const FAMILY_NAV = [
  { href: "/", label: "Home", short: "Home", icon: "i-home" },
  { href: "/sessions", label: "Sessions", short: "Sessions", icon: "i-cal" },
  { href: "/development", label: "My plan", short: "My plan", icon: "i-target" },
  { href: "/announcements", label: "News", short: "News", icon: "i-megaphone" },
  { href: "/club", label: "Account", short: "Account", icon: "i-people" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { data, team, setTeam } = useApp();
  const family = data.role === "player" || data.role === "parent";
  const nav = family ? FAMILY_NAV : NAV;
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  // Phone menu: the four places people use most, the rest under More.
  const PHONE = family ? FAMILY_NAV.map((n) => n.href) : ["/", "/squad", "/sessions", "/development"];
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
        <div className="brand">
          <svg aria-hidden="true">
            <use href="#logo" />
          </svg>
          <b>Overlap</b>
        </div>
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
          {!family && <div className="lbl">Club hub</div>}
          {nav.map((n) => (
            <Link key={n.href} href={n.href} prefetch aria-current={active(n.href) ? "page" : undefined}>
              <svg className="i">
                <use href={`#${n.icon}`} />
              </svg>
              {n.label}
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
          <div className="brand">
            <svg aria-hidden="true" style={{ width: 30, height: 30 }}>
              <use href="#logo" />
            </svg>
            <b style={{ fontSize: 22 }}>Overlap</b>
          </div>
          {teamSelect("team-select-m")}
          <Link className="av" href="/club#account" aria-label={`Your account: ${data.myName}`} style={{ textDecoration: "none" }}>
            {initials(data.myName)}
          </Link>
        </header>
        <main id="main">{children}</main>
      </div>

      {more && (
        <div className="more-sheet" role="menu" aria-label="More">
          {moreItems.map((n) => (
            <Link key={n.href} href={n.href} role="menuitem" aria-current={active(n.href) ? "page" : undefined} onClick={() => setMore(false)}>
              <svg className="i">
                <use href={`#${n.icon}`} />
              </svg>
              {n.label}
            </Link>
          ))}
        </div>
      )}
      <nav className="bnav" aria-label="Sections">
        {nav.filter((n) => PHONE.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} prefetch aria-current={active(n.href) ? "page" : undefined}>
            <svg className="i">
              <use href={`#${n.icon}`} />
            </svg>
            {n.short}
          </Link>
        ))}
        {moreItems.length > 0 && (
        <button type="button" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore(!more)} style={moreItems.some((n) => active(n.href)) && !more ? { color: "var(--gold)" } : undefined}>
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
