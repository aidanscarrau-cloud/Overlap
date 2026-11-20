import type { Metadata } from "next";
import Link from "next/link";
import { brandVars, DEFAULT_BRAND } from "@/lib/brand";
import { ContactForm } from "@/components/landing/ContactForm";
import { DrillDemo, type DemoDrill } from "@/components/landing/DrillDemo";
import { StickyRegister } from "@/components/landing/StickyRegister";
import { LIBRARY_BY_KEY } from "@/lib/library-drills";

export const metadata: Metadata = {
  title: { absolute: "Overlap · The club app for grassroots football" },
  description: "Training, matches, team chat, trials, line-ups and player development in one simple app for coaches, players and parents.",
};

/* The public front page: what Overlap is, for clubs thinking about it. Signed-in people go straight to their club. */

const FEATURES = [
  {
    img: "/landing/f-home.webp",
    h: 713,
    phone: "/landing/coach-phone.webp",
    tag: "For coaches",
    bg: "#fff1db",
    fg: "#8a4b00",
    title: "Know who's coming before you set out the cones",
    text: "The next session is front and centre, with who's coming, who can't and who hasn't replied.",
    points: ["Families get a reminder the evening before", "Take the register in a few taps", "See what needs doing this week"],
  },
  {
    img: "/landing/f-drills.webp",
    h: 687,
    phone: "",
    demo: true,
    tag: "Session planning",
    bg: "#e8eefc",
    fg: "#1e40af",
    title: "Plan a session in minutes, with drills you can watch",
    text: "A library of animated drills by age and theme. Pick a focus, press Suggest, and the session builds itself.",
    points: ["Drills play on the pitch so players get it", "Drag to reorder, change the minutes", "Walk the team through it on a tablet"],
  },
  {
    img: "/landing/f-squad.webp",
    h: 856,
    phone: "/landing/lineup-phone.webp",
    tag: "Squad & line-ups",
    bg: "#e7f6ec",
    fg: "#166534",
    title: "Line-ups, availability and injuries on one pitch",
    text: "Drag players into an 11-a-side formation and see at a glance who's available, injured or hasn't replied.",
    points: ["23 eleven-a-side formations", "Share the line-up with families in one tap", "Injuries with return-to-play steps"],
  },
  {
    img: "/landing/f-selection.webp",
    h: 657,
    phone: "/landing/trial-night.webp",
    tag: "Trials",
    bg: "#f3e8ff",
    fg: "#6b21a8",
    title: "Run trials without the spreadsheet chaos",
    text: "A sign-up link in your club's colours, or import the spreadsheet from your Google Form.",
    points: ["Check players in and rate them on the night", "Rank by position against your squad targets", "Send offers; accepting adds them to the squad"],
  },
];

const PHONES = [
  { img: "/landing/coach-phone.webp", title: "Who's coming, at a glance", text: "Coaches see replies the moment families tap Yes or No." },
  { img: "/landing/chat.webp", title: "Team chat built in", text: "Replies, reactions and photos, with age-safe settings." },
  { img: "/landing/plan.webp", title: "Player development", text: "Goals and progress families can actually see." },
  { img: "/landing/trial-night.webp", title: "Trial night on a phone", text: "Tick players in and rate them at the ground." },
];

const ROLES = [
  { title: "Parents & players", icon: "i-people", bg: "#fff1db", fg: "#b45309", points: ["Reply Yes or No in one tap", "Schedule, chat and club news", "Report an injury, follow progress"] },
  { title: "Coaches", icon: "i-board", bg: "#e8eefc", fg: "#1e40af", points: ["Plan sessions with animated drills", "Take the register, pick line-ups", "Fitness tests and development"] },
  { title: "Club admins", icon: "i-squad", bg: "#e7f6ec", fg: "#166534", points: ["Every team in one place", "Trials, invites and announcements", "See who's dropping off"] },
];

const MORE = [
  { title: "Matches & draw import", text: "Paste your fixtures, collect availability, record results and stats.", icon: "i-ball", bg: "#e7f6ec", fg: "#166534" },
  { title: "Fitness testing", text: "Sprints, agility, Gacon 45-15 and more, with progress and leaderboards.", icon: "i-clock", bg: "#e8eefc", fg: "#1e40af" },
  { title: "Injuries", text: "Six return-to-play steps, with a doctor's clearance for concussion.", icon: "i-squad", bg: "#fde4e2", fg: "#a3241b" },
  { title: "Announcements", text: "News to the whole club or one team, by app and email.", icon: "i-megaphone", bg: "#fff1db", fg: "#8a4b00" },
  { title: "Calendar links", text: "Sessions and matches in everyone's phone calendar, always up to date.", icon: "i-cal", bg: "#f3e8ff", fg: "#6b21a8" },
  { title: "Insights", text: "Attendance trends, who's dropping off, replies and minutes played.", icon: "i-chart", bg: "#e0f2fe", fg: "#075985" },
];

// Three real drills from the library for the live demo (only these are sent to the browser).
const DEMO: DemoDrill[] = ["third-man-lines", "wall-pass-relay", "six-second-win-back"].flatMap((k) => {
  const d = LIBRARY_BY_KEY.get(k);
  return d ? [{ key: d.key, name: d.name, minutes: d.minutes, players: d.player_count, area: d.area, points: d.points, diagram: d.diagram }] : [];
});

const FAQ: [string, React.ReactNode][] = [
  ["Is it safe for children?", <>Each club&apos;s data is private to that club, chat is off for younger players by default, and private messages are never open to players. <Link href="/privacy">Read how we protect children&apos;s information</Link>.</>],
  ["Where is our data kept?", <>In Australia (Sydney). Admins can download all of the club&apos;s data at any time.</>],
  ["Does it work with PlayHQ?", <>It sits alongside it: import your players from a registration export and paste your fixtures straight in.</>],
  ["Do families have to pay or download anything?", <>No. It&apos;s free for families and works on any phone; they add it to their home screen in 30 seconds.</>],
  ["We already use TeamApp or Spond. How do we switch?", <>Import your players from your registration spreadsheet and Overlap emails every family an invite linked to their child. Many clubs run both for a couple of weeks, then switch off the old app once families are replying in Overlap.</>],
  ["How does paying work?", <>$60 a month, or $600 a year (two months free), for the whole club. Pay monthly and cancel any time. Overlap isn&apos;t registered for GST, so there&apos;s no GST added, and you&apos;ll get an invoice your treasurer can file.</>],
  ["Who runs Overlap?", <>Overlap is built and run by Aidan Scarr in Newcastle, Australia. You can reach him through the <Link href="/help#contact">contact form</Link>.</>],
  ["What if we need help?", <>There&apos;s a <Link href="/help">help page</Link> and a support form, and we&apos;ll help set your club up.</>],
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
          <a href="#contact">Register interest</a>
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
              Register interest
            </a>
            <a href="#features" className="btn lp-big lp-ghost">
              See how it works
            </a>
          </div>
          <ul className="lp-ticks">
            <li>Opening to more clubs soon</li>
            <li>Unlimited teams, players and parents</li>
            <li>Your club&apos;s badge and colours</li>
            <li>Made in Australia</li>
          </ul>
        </div>
        <div className="lp-stage" aria-hidden="true">
          <div className="lp-dev lp-dev-l">
            <img src="/landing/coach-phone.webp" alt="" width={780} height={1688} />
          </div>
          <div className="lp-dev lp-dev-r">
            <img src="/landing/lineup-phone.webp" alt="" width={780} height={1688} />
          </div>
          <div className="lp-dev lp-dev-c">
            <img src="/landing/family-home.webp" alt="" width={780} height={1688} />
          </div>
          <span className="lp-chip lp-chip-1">
            <i className="ok">✓</i>
            <span>
              <b>Leo&apos;s coming</b>
              <small>Tuesday training</small>
            </span>
          </span>
          <span className="lp-chip lp-chip-2">
            <i>9</i>
            <span>
              <b>coming Tuesday</b>
              <small>2 haven&apos;t replied</small>
            </span>
          </span>
          <span className="lp-chip lp-chip-3">
            <i>⚽</i>
            <span>
              <b>Line-up shared</b>
              <small>with families</small>
            </span>
          </span>
        </div>
      </section>

      <section className="lp-roles" aria-label="Who it's for">
        {ROLES.map((r) => (
          <article key={r.title}>
            <span className="lp-ic" style={{ background: r.bg, color: r.fg }}>
              <svg aria-hidden="true">
                <use href={`#${r.icon}`} />
              </svg>
            </span>
            <h2>{r.title}</h2>
            <ul>
              {r.points.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="lp-steps" aria-label="How it works">
        <span className="lp-kicker">How it works</span>
        <h2>Up and running before the first training</h2>
        <ol>
          <li>
            <b>Set up your club</b>
            <p>Add your badge and colours, then bring every team in from your registration spreadsheet (PlayHQ works).</p>
          </li>
          <li>
            <b>Families join in one tap</b>
            <p>Each family gets an email invite already linked to their child. Overlap goes on their home screen in 30 seconds.</p>
          </li>
          <li>
            <b>Run the season</b>
            <p>Coaches plan sessions and pick line-ups, families reply and chat, and you can see the whole club at a glance.</p>
          </li>
        </ol>
      </section>

      <div id="features" className="lp-features">
        {FEATURES.map((f, i) => (
          <article key={f.title} className={i % 2 ? "rev" : ""}>
            <div className="lp-f-txt">
              <span className="lp-tag" style={{ background: f.bg, color: f.fg }}>
                {f.tag}
              </span>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
              <ul className="lp-points">
                {f.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            {"demo" in f && f.demo ? (
              <DrillDemo drills={DEMO} />
            ) : (
              <>
                <figure className="lp-shot lp-desk-only">
                  <span className="lp-chrome" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <img src={f.img} alt={`Overlap: ${f.tag.toLowerCase()}`} loading="lazy" width={1400} height={f.h} />
                </figure>
                <span className="lp-dev lp-dev-row lp-phone-only">
                  <img src={f.phone} alt={`Overlap on a phone: ${f.tag.toLowerCase()}`} loading="lazy" width={780} height={1688} />
                </span>
              </>
            )}
          </article>
        ))}
      </div>

      <section className="lp-phones">
        <span className="lp-kicker">On every phone</span>
        <h2>Made for the phone in every parent&apos;s pocket</h2>
        <p className="lp-sub">Families add Overlap to their home screen in 30 seconds and get a notification when training changes. Free for them, nothing to download from an app store.</p>
        <div className="lp-phone-row">
          {PHONES.map((p) => (
            <figure key={p.title}>
              <span className="lp-dev lp-dev-row">
                <img src={p.img} alt={p.title} loading="lazy" width={780} height={1688} />
              </span>
              <figcaption>
                <b>{p.title}</b>
                {p.text}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="lp-more">
        <span className="lp-kicker">And the rest</span>
        <h2>Everything else a club needs</h2>
        <ul>
          {MORE.map((m) => (
            <li key={m.title}>
              <span className="lp-ic sm" style={{ background: m.bg, color: m.fg }}>
                <svg aria-hidden="true">
                  <use href={`#${m.icon}`} />
                </svg>
              </span>
              <b>{m.title}</b>
              <p>{m.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="lp-pricing">
        <div className="lp-price-card">
          <span className="lp-price-for">Planned price · whole club</span>
          <div className="lp-price">
            <b>$60</b>
            <span>per month</span>
          </div>
          <p className="lp-price-year">
            or <b>$600 a year</b>, two months free
          </p>
          <p>For your whole club, however many teams. A club with 100 players would pay about 60c per player a month. Australian dollars, no GST added.</p>
          <ul className="lp-ticks">
            <li>Unlimited teams, players, parents and coaches</li>
            <li>Every feature, including trials and the drill library</li>
            <li>Help getting your club set up</li>
            <li>Pay monthly and cancel any time</li>
          </ul>
          <p className="lp-pilot">We&apos;re running Overlap with our own club this season. Register your interest and we&apos;ll let you know when we open to more clubs.</p>
          <a href="#contact" className="btn primary lp-big">
            Register interest
          </a>
        </div>
        <div className="lp-faq">
          <span className="lp-kicker">Questions committees ask</span>
          <h2>The fine print, in plain English</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contact" className="lp-contact">
        <div className="lp-contact-txt">
          <span className="lp-kicker">Get in early</span>
          <h2>Register your club&apos;s interest</h2>
          <p>We&apos;re trialling Overlap with our own club this season before opening it up. Tell us about your club and we&apos;ll be in touch.</p>
          <ul className="lp-ticks">
            <li>No cost or commitment to register</li>
            <li>First in line when we open to more clubs</li>
            <li>We&apos;ll help set your club up, players and all</li>
          </ul>
        </div>
        <ContactForm />
      </section>

      <StickyRegister />

      <footer className="lp-footer">
        <div>
          <span className="lp-logo">
            <svg aria-hidden="true">
              <use href="#logo" />
            </svg>
            Overlap
          </span>
          <p>The club app for grassroots football. Built and run by Aidan Scarr in Newcastle, Australia.</p>
        </div>
        <nav aria-label="Footer">
          <b>Product</b>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/get-app">Get the app</Link>
        </nav>
        <nav aria-label="Support">
          <b>Support</b>
          <Link href="/help">Help</Link>
          <Link href="/help#contact">Contact us</Link>
          <Link href="/privacy">Privacy &amp; child safety</Link>
        </nav>
        <nav aria-label="Account">
          <b>Members</b>
          <Link href="/login">Sign in</Link>
          <Link href="/get-app">Install on your phone</Link>
        </nav>
      </footer>
    </div>
  );
}
