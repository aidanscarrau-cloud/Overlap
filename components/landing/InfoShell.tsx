import Link from "next/link";
import { brandVars, DEFAULT_BRAND } from "@/lib/brand";

/** Frame for the public info pages (privacy, help): Overlap's top bar, a readable column, the footer. */
export function InfoShell({ kicker, title, updated, children }: { kicker: string; title: string; updated?: string; children: React.ReactNode }) {
  const vars = brandVars(DEFAULT_BRAND.primary, DEFAULT_BRAND.accent) as React.CSSProperties;
  return (
    <div className="look-root lp ip" data-look="club" style={vars}>
      <header className="lp-nav">
        <Link href="/" className="lp-logo" aria-label="Overlap home">
          <svg aria-hidden="true">
            <use href="#logo" />
          </svg>
          Overlap
        </Link>
        <nav aria-label="Main">
          <Link href="/help">Help</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login" className="lp-signin">
            Sign in
          </Link>
        </nav>
      </header>
      <main className="ip-main">
        <span className="lp-kicker">{kicker}</span>
        <h1>{title}</h1>
        {updated && <p className="ip-updated">Last updated {updated}</p>}
        {children}
      </main>
      <footer className="lp-foot">
        <span>
          <b>Overlap</b> · made in Australia for grassroots football
        </span>
        <span>
          <Link href="/help">Help</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/login">Sign in</Link>
        </span>
      </footer>
    </div>
  );
}
