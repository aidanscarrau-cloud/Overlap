"use client";

import Link from "next/link";
import { useApp } from "./AppProvider";

/* Lite (free) and Pro ($60 a month) plans. Pro features show an upgrade screen on Lite. */

export const PRO_FEATURES = [
  "Drill library with animated drills and the session planner",
  "Line-ups on the pitch, shared with families",
  "Trials: sign-up form, trial nights, selection and offers",
  "Player development: ratings, goals and progress",
  "Fitness testing and leaderboards",
  "Injuries with return-to-play steps",
  "Coach insights: attendance trends and who's dropping off",
  "Your club's colours and badge, and player import",
];

export function usePro() {
  const { data } = useApp();
  return data.club.plan !== "lite";
}

export function ProBadge() {
  return <span className="pro-badge">PRO</span>;
}

/** Full upgrade screen (used in place of a Pro page or panel on Lite). */
export function Upgrade({ feature, blurb, compact }: { feature: string; blurb?: string; compact?: boolean }) {
  const { isAdmin, data } = useApp();
  return (
    <section className={`upg${compact ? " compact" : ""}`} aria-label={`${feature} is part of Overlap Pro`}>
      <ProBadge />
      <h2>{feature} is part of Overlap Pro</h2>
      {blurb && <p>{blurb}</p>}
      {!compact && (
        <ul>
          {PRO_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <p className="upg-price">
        <b>$60 a month</b> or $600 a year for the whole club. Unlimited teams. Cancel any time.
      </p>
      {isAdmin ? (
        <Link className="btn primary" href="/help?topic=billing#contact">
          Upgrade {data.club.name} to Pro
        </Link>
      ) : (
        <p className="upg-ask">Ask your club admin about upgrading to Pro.</p>
      )}
    </section>
  );
}

/** Shows the children on Pro, the upgrade screen on Lite. */
export function ProGate({ feature, blurb, compact, children }: { feature: string; blurb?: string; compact?: boolean; children: React.ReactNode }) {
  return usePro() ? <>{children}</> : <Upgrade feature={feature} blurb={blurb} compact={compact} />;
}
