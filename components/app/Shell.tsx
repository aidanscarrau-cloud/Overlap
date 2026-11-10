"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { SheetHost } from "./sheets/SheetHost";
import { ROLES } from "@/lib/constants";
import { initials } from "@/lib/format";
import { Crest } from "@/components/ui";

const NAV = [
  { href: "/", label: "Overview", short: "Overview", icon: "i-home" },
  { href: "/announcements", label: "Announcements", short: "News", icon: "i-megaphone" },
  { href: "/squad", label: "Squad", short: "Squad", icon: "i-squad" },
  { href: "/sessions", label: "Sessions", short: "Sessions", icon: "i-cal" },
  { href: "/drills", label: "Drill library", short: "Drills", icon: "i-board" },
  { href: "/club", label: "Club & members", short: "Club", icon: "i-people" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { data, team, setTeam } = useApp();
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

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
              <option value="__new">Join another club…</option>
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
          <div className="lbl">Club hub</div>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
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
          <Link href="/onboarding" style={{ fontSize: 12.5, color: "var(--on-navy-muted)" }}>
            Join another club
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

      <nav className="bnav" aria-label="Sections" style={{ gridTemplateColumns: `repeat(${NAV.length},1fr)` }}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
            <svg className="i">
              <use href={`#${n.icon}`} />
            </svg>
            {n.short}
          </Link>
        ))}
      </nav>
      <SheetHost />
    </div>
  );
}
