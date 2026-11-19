"use client";

import { useEffect, useState } from "react";
import { brandVars, DEFAULT_BRAND } from "@/lib/brand";
import { LAST_CLUB_COOKIE, parseLastClub, type LastClub } from "@/lib/last-club";
import { Crest, PitchLines } from "@/components/ui";

/*
 * The frame around sign in, sign up and password reset, in the same Matchday look as the app.
 * Someone who has used Overlap on this device sees their club's badge, name and colours;
 * everyone else sees Overlap's own. On phones the form comes first.
 */
export function AuthShell({ children, club: given }: { children: React.ReactNode; club?: LastClub | null }) {
  const [club, setClub] = useState<LastClub | null>(given ?? null);
  useEffect(() => {
    if (given !== undefined) return;
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${LAST_CLUB_COOKIE}=`))?.slice(LAST_CLUB_COOKIE.length + 1);
    setClub(parseLastClub(raw));
  }, [given]);
  const vars = brandVars(club?.primary ?? DEFAULT_BRAND.primary, club?.accent ?? DEFAULT_BRAND.accent) as React.CSSProperties;

  return (
    <div className="look-root auth2" data-look="club" style={vars}>
      <header className="auth2-top">
        {club ? (
          <>
            <Crest url={club.logo} size={44} />
            <span className="auth2-club">
              <small>Welcome to</small>
              <b>{club.name}</b>
            </span>
          </>
        ) : (
          <>
            <svg className="auth2-logo" aria-hidden="true">
              <use href="#logo" />
            </svg>
            <span className="auth2-club">
              <small>Club hub</small>
              <b>Overlap</b>
            </span>
          </>
        )}
      </header>

      <main className="auth2-main">
        {children}
        <p className="auth2-links">
          <a href="/help">Help</a> · <a href="/privacy">Privacy</a>
        </p>
      </main>

      <aside className="auth2-art">
        <PitchLines />
        <div className="auth2-art-in">
          {club ? <Crest url={club.logo} size={88} className="auth2-crest" /> : null}
          <h1>{club ? club.name : "Run your club from the touchline"}</h1>
          <p>{club ? "Training, matches, chat and your player's development, all in one place." : "Plan training, manage every squad and keep players and parents in the loop."}</p>
          <ul>
            <li>Reply to training and matches in one tap</li>
            <li>Team chat, session plans and drills you can watch</li>
            <li>Line-ups, attendance and development for every player</li>
          </ul>
          <span className="auth2-foot">{club ? "Powered by Overlap" : "Overlap club hub"}</span>
        </div>
      </aside>
    </div>
  );
}
