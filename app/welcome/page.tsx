import type { Metadata } from "next";
import Link from "next/link";
import { brandVars, DEFAULT_BRAND } from "@/lib/brand";
import { ContactForm } from "@/components/landing/ContactForm";

export const metadata: Metadata = {
  title: { absolute: "Overlap · The club app for grassroots football" },
  description: "Training, matches, team chat, trials, line-ups and player development in one simple app for coaches, players and parents.",
};

/* The public front page: what Overlap is, for clubs thinking about it. Signed-in people go straight to their club. */

const FEATURES = [
  {
    img: "/landing/coach-home.webp",
    tag: "For coaches",
    title: "Know who's coming before you set out the cones",
    text: "The next session front and centre with who's coming, who can't and who hasn't replied. Families get a reminder the night before. Take attendance in a tap.",
  },
  {
    img: "/landing/drills.webp",
    tag: "Session planning",
    title: "Plan a session in minutes, with drills you can watch",
    text: "A library of animated drills by age and theme. Build a session, drag to reorder, see it on the pitch and walk players through it on a tablet.",
  },
  {
    img: "/landing/squad.webp",
    tag: "Squad & line-ups",
    title: "Line-ups, availability and injuries on one pitch",
    text: "Drag players into any 11-a-side formation, see who's injured or unavailable, then share the line-up with families.",
  },
  {
    img: "/landing/selection.webp",
    tag: "Trials",
    title: "Run trials without the spreadsheet chaos",
    text: "A sign-up link in your club's colours (or import your Google Form), check-in and star ratings on the night, then send offers. Accepting adds the player to the squad.",
  },
];

const PHONES = [
  { img: "/landing/family-home.webp", title: "Yes or no in one tap", text: "Parents see the next session and reply straight away." },
  { img: "/landing/chat.webp", title: "Team chat built in", text: "Replies, reactions, photos. Age-safe settings for younger players." },
  { img: "/landing/plan.webp", title: "Player development", text: "Ratings, goals and progress families can actually see." },
  { img: "/landing/trial-night.webp", title: "Trial night on a phone", text: "Tick players in and rate them at the ground." },
];

export default function Welcome() {
  const vars = brandVars(DEFAULT_BRAND.primary, DEFAULT_BRAND.accent) as React.CSSProperties;
  return (
    <div className="look-root lp" data-look="club" style={vars}>
      <header className="lp-nav">
        <Link href="/" className="lp-logo" aria-label="Overlap home">
          <svg aria-hidden="true">
            <use href="#logo" />
          </svg>
          Overlap
        </Link>
        <nav aria-label="Main">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
          <Link href="/login" className="lp-signin">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-txt">
          <span className="lp-kicker">The club app for grassroots football</span>
          <h1>Your whole club, in one simple app</h1>
          <p>Training, matches, team chat, trials, line-ups and player development, for coaches, players and parents. Set up in an afternoon. Works on any phone, no app store needed.</p>
          <div className="lp-ctas">
            <a href="#contact" className="btn primary lp-big">
              Book a demo
            </a>
            <Link href="/login?mode=signup" className="btn lp-big lp-ghost">
              Set up your club
            </Link>
          </div>
          <ul className="lp-ticks">
            <li>Unlimited teams, players and parents</li>
            <li>Your club&apos;s badge and colours</li>
            <li>Made in Australia</li>
          </ul>
        </div>
        <div className="lp-hero-pics" aria-hidden="true">
          <img className="lp-desk" src="/landing/coach-home.webp" alt="" width={1440} height={900} />
          <img className="lp-phone" src="/landing/family-home.webp" alt="" width={520} height={1126} />
        </div>
      </section>

      <section className="lp-who">
        <div>
          <b>Parents &amp; players</b>
          <p>Reply in one tap, see the schedule, chat with the team, report an injury and follow their development.</p>
        </div>
        <div>
          <b>Coaches</b>
          <p>Plan sessions with animated drills, take attendance, pick line-ups, track fitness and get return-to-play steps for injuries.</p>
        </div>
        <div>
          <b>Club admins</b>
          <p>Every team in one place: invites, roles, trials, announcements and club-branded emails, with insights on who&apos;s dropping off.</p>
        </div>
      </section>

      <section id="features" className="lp-features">
        {FEATURES.map((f, i) => (
          <article key={f.title} className={i % 2 ? "rev" : ""}>
            <div className="lp-f-txt">
              <span className="lp-kicker">{f.tag}</span>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </div>
            <img src={f.img} alt={`Overlap ${f.tag.toLowerCase()} screen`} loading="lazy" width={1440} height={900} />
          </article>
        ))}
      </section>

      <section className="lp-phones">
        <h2>Made for the phone in every parent&apos;s pocket</h2>
        <p className="lp-sub">Families add Overlap to their home screen in 30 seconds and get notifications when training changes. Free for them, no app store.</p>
        <div className="lp-phone-row">
          {PHONES.map((p) => (
            <figure key={p.title}>
              <img src={p.img} alt={p.title} loading="lazy" width={520} height={1126} />
              <figcaption>
                <b>{p.title}</b>
                {p.text}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="lp-more">
        <h2>Everything else a club needs</h2>
        <ul>
          <li>
            <b>Matches &amp; draw import</b>Fixtures, availability, results and stats.
          </li>
          <li>
            <b>Fitness testing</b>Sprint, agility, Gacon 45-15 and more, with leaderboards.
          </li>
          <li>
            <b>Injuries</b>Six return-to-play steps, with concussion safeguards.
          </li>
          <li>
            <b>Announcements</b>News to the whole club or one team, by app and email.
          </li>
          <li>
            <b>Calendar links</b>Sessions and matches in everyone&apos;s phone calendar.
          </li>
          <li>
            <b>Safe by design</b>Each club&apos;s data is private to that club; roles decide who sees what.
          </li>
        </ul>
      </section>

      <section id="pricing" className="lp-pricing">
        <div>
          <span className="lp-kicker">Pricing</span>
          <h2>One simple price per club</h2>
          <p>Not per player, not per team. Every coach, player and parent in your club is included, along with every feature.</p>
          <ul className="lp-ticks">
            <li>Unlimited teams, players, parents and coaches</li>
            <li>Every feature, including trials and the drill library</li>
            <li>Help getting your club set up</li>
          </ul>
        </div>
        <div className="lp-price-card">
          <b>Founding clubs</b>
          <p>We&apos;re taking on a small number of clubs at a founding-club price for the first season.</p>
          <a href="#contact" className="btn primary lp-big">
            Ask about pricing
          </a>
        </div>
      </section>

      <section id="contact" className="lp-contact">
        <div>
          <h2>See it with your club&apos;s colours</h2>
          <p>Tell us a bit about your club and we&apos;ll show you Overlap set up for you, or answer any questions.</p>
        </div>
        <ContactForm />
      </section>

      <footer className="lp-foot">
        <span>
          <b>Overlap</b> · made in Australia for grassroots football
        </span>
        <span>
          <Link href="/login">Sign in</Link> · <Link href="/get-app">Get the app</Link>
        </span>
      </footer>
    </div>
  );
}
