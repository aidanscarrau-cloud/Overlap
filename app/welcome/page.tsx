import type { Metadata } from "next";
import Link from "next/link";
import { brandVars, DEFAULT_BRAND } from "@/lib/brand";
import { ContactForm } from "@/components/landing/ContactForm";
import { DrillDemo, type DemoDrill } from "@/components/landing/DrillDemo";
import { StickyRegister } from "@/components/landing/StickyRegister";
import { SignInLink } from "@/components/landing/SignInLink";
import { LIBRARY_BY_KEY } from "@/lib/library-drills";
import { HoursCalc } from "@/components/landing/HoursCalc";

const SITE = (process.env.SITE_URL || "https://overlap-three-pi.vercel.app").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { absolute: "Overlap · Stop chasing replies. Start coaching." },
  description: "The club app for grassroots football: training, matches, chat, trials and line-ups in one app families actually use. Founding clubs get their first season of Pro free.",
  openGraph: {
    title: "Overlap · Stop chasing replies. Start coaching.",
    description: "Training, matches, chat, trials and line-ups in one app families actually use. Founding clubs get their first season of Pro free.",
    url: "/",
    siteName: "Overlap",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Overlap: the club app for grassroots football" }],
    locale: "en_AU",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Overlap · Stop chasing replies. Start coaching.", images: ["/og.png"] },
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

const LITE = [
  "Training and match schedule",
  "Yes / No replies and reminders",
  "Team chat and announcements",
  "Phone app and notifications",
  "Squad list and the register",
  "Calendar links, help and data export",
];
const PRO = [
  "Animated drill library and session planner",
  "Line-ups shared with families",
  "Trials, from sign-up to offers",
  "Player development and fitness testing",
  "Injuries with return-to-play steps",
  "Coach insights",
  "Your club's colours and badge",
  "Import every player from a spreadsheet",
];

const PAINS = [
  { e: "💬", t: "37 unread in the parents' chat", d: "…and still no idea who's actually coming on Tuesday." },
  { e: "📋", t: "Trials on a form, three spreadsheets and a clipboard", d: "Then someone has to email every family, one by one." },
  { e: "🧠", t: "Session plans live in one coach's head", d: "When they're away, training turns into a scrimmage." },
  { e: "🙋", t: "The same five volunteers do everything", d: "And they're tired by the end of pre-season." },
];
const REPLACES = ["Group chats", "Spreadsheets", "Paper registers", "Google Forms", "Word docs"];
const VS: [string, string, string][] = [
  ["Who's coming Tuesday?", "Scroll the group chat and count the thumbs-ups", "Live count on the coach's home screen"],
  ["Training changes", "Message three chats and hope everyone sees it", "One change; every family gets a notification"],
  ["Taking the register", "Paper sheet, typed up later (or never)", "A few taps; attendance trends build themselves"],
  ["Session plans", "In someone's head or a Word doc", "Animated drills and a plan the whole club can reuse"],
  ["Trials", "Google Form, spreadsheets, 40 emails", "Sign-up, ratings, offers and invites in one flow"],
  ["Line-ups", "A photo of a whiteboard", "Drag players onto a pitch and share with families"],
];

const FAQ: [string, React.ReactNode][] = [
  ["What's the catch with the free founding season?", <>There isn&apos;t one. We want ten clubs to help shape Overlap. After your first season Pro is $60 a month; if you&apos;d rather not, your club drops to Lite, which is free forever, and you keep all your data.</>],
  ["Is it safe for children?", <>Each club&apos;s data is private to that club, chat is off for younger players by default, and private messages are never open to players. <Link href="/privacy">Read how we protect children&apos;s information</Link>.</>],
  ["Where is our data kept?", <>In Australia (Sydney). Admins can download all of the club&apos;s data at any time.</>],
  ["Does it work with PlayHQ?", <>It sits alongside it: import your players from a registration export and paste your fixtures straight in.</>],
  ["Do families have to pay or download anything?", <>No. It&apos;s free for families and works on any phone; they add it to their home screen in 30 seconds.</>],
  ["We already use TeamApp or Spond. How do we switch?", <>Import your players from your registration spreadsheet and Overlap emails every family an invite linked to their child. Many clubs run both for a couple of weeks, then switch off the old app once families are replying in Overlap.</>],
  ["What's free and what's Pro?", <>Lite is free for every club with no team limit: schedule, replies, chat, announcements, the phone app and the register. Pro adds the coaching and club tools: drills and session plans, line-ups, trials, development, fitness, injuries, insights, your colours and badge, and player import.</>],
  ["How does paying for Pro work?", <>$60 a month, or $600 a year (two months free), for the whole club. Pay monthly and cancel any time; you keep Lite for free. Overlap isn&apos;t registered for GST, so there&apos;s no GST added, and you&apos;ll get an invoice your treasurer can file.</>],
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
          <a href="#offer">Founding clubs</a>
          <SignInLink className="lp-signin" />
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-txt">
          <a href="#offer" className="lp-offer-pill">
            <b>Founding clubs</b> <span className="lp-long">First season of Pro free · 10 spots →</span>
            <span className="lp-short">First season of Pro free →</span>
          </a>
          <h1>Stop chasing replies. Start coaching.</h1>
          <p>
            <span className="lp-long">Overlap puts your whole club in one app families actually use: training, matches, chat, trials and line-ups. Coaches know who&apos;s coming before they set out the cones, and volunteers get their weeknights back.</span>
            <span className="lp-short">Training, matches, chat, trials and line-ups in one app families actually use.</span>
          </p>
          <div className="lp-ctas">
            <a href="#contact" className="btn primary lp-big">
              Claim a founding spot
            </a>
            <a href="#features" className="btn lp-big lp-ghost">
              See it in action
            </a>
          </div>
          {/* Small phones: a peek at the app on the first screen (the three-phone picture is hidden there). */}
          <div className="lp-peek" aria-hidden="true">
            <span className="lp-peek-dev">
              <img src="/landing/family-home.webp" alt="" width={780} height={1688} />
            </span>
            <span className="lp-chip lp-peek-chip">
              <i className="ok">✓</i>
              <span>
                <b>Leo&apos;s coming</b>
                <small>Tuesday training</small>
              </span>
            </span>
          </div>
          <ul className="lp-ticks">
            <li>Free for families, any phone</li>
            <li>Set up in an afternoon</li>
            <li>Lite plan free forever</li>
            <li>Data kept in Australia</li>
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

      <section className="lp-trust" aria-label="Why clubs can trust Overlap">
        <span>
          <b>Built with Southern Lakes United FC</b> this season
        </span>
        <span>
          <b>Data stored in Sydney</b>, private to your club
        </span>
        <span>
          <b>Made in Newcastle, NSW</b> by Aidan Scarr
        </span>
        <span>
          <b>Free for families</b>, no app store needed
        </span>
      </section>

      <section className="lp-pain" aria-label="Sound familiar?">
        <span className="lp-kicker">Sound familiar?</span>
        <h2>Running a club shouldn&apos;t take over your evenings</h2>
        <div className="lp-pain-grid">
          {PAINS.map((x) => (
            <article key={x.t}>
              <span aria-hidden="true">{x.e}</span>
              <b>{x.t}</b>
              <p>{x.d}</p>
            </article>
          ))}
        </div>
        <p className="lp-replaces">
          <span>Overlap replaces</span>
          {REPLACES.map((r) => (
            <s key={r}>{r}</s>
          ))}
        </p>
      </section>

      <section className="lp-vs" aria-label="Before and after Overlap">
        <div className="lp-vs-head">
          <span className="lp-kicker">Before and after</span>
          <h2>The same Tuesday night, two ways</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Task</span>
              </th>
              <th scope="col">Group chats &amp; spreadsheets</th>
              <th scope="col" className="ov">
                With Overlap
              </th>
            </tr>
          </thead>
          <tbody>
            {VS.map(([task, before, after]) => (
              <tr key={task}>
                <th scope="row">{task}</th>
                <td>
                  <span className="x" aria-hidden="true">
                    ✕
                  </span>
                  {before}
                </td>
                <td className="ov">
                  <span className="ok" aria-hidden="true">
                    ✓
                  </span>
                  {after}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

      <section className="lp-calc-wrap" aria-label="Volunteer hours">
        <div>
          <span className="lp-kicker">Do the maths</span>
          <h2>How much volunteer time goes on admin?</h2>
          <p>Move the sliders to match your club. It&apos;s a rough estimate, but it&apos;s the number your committee will care about.</p>
        </div>
        <HoursCalc />
      </section>

      <section className="lp-founder" aria-label="A note from the founder">
        <span className="lp-founder-av" aria-hidden="true">
          AS
        </span>
        <blockquote>
          <p>
            &ldquo;I&apos;m building Overlap with my own club, Southern Lakes United FC, this season. Every feature has to survive a real Tuesday night training and a real Saturday morning before it reaches you. If you join as a founding club,
            you&apos;ll have my number, and what you tell me shapes what gets built next.&rdquo;
          </p>
          <footer>
            <b>Aidan Scarr</b>, founder · Newcastle, NSW
          </footer>
        </blockquote>
      </section>

      <section id="offer" className="lp-offer">
        <div className="lp-offer-txt">
          <span className="lp-offer-tag">Founding clubs · 10 spots</span>
          <h2>Your first season of Pro, free</h2>
          <p>We&apos;re opening Overlap to ten founding clubs after our test season. Founding clubs get:</p>
          <ul className="lp-ticks">
            <li>Every Pro feature free for your first season</li>
            <li>Your club set up for you: players imported, colours and badge on</li>
            <li>A direct line to the founder, and a say in what gets built</li>
            <li>No card needed now. Afterwards, $60 a month or stay on Lite for free</li>
          </ul>
          <a href="#contact" className="btn primary lp-big">
            Claim a founding spot
          </a>
        </div>
        <div className="lp-offer-badge" aria-hidden="true">
          <b>$0</b>
          <span>Pro, your first season</span>
          <small>then $60/month · cancel any time</small>
        </div>
      </section>

      <section id="pricing" className="lp-plans">
        <span className="lp-kicker">Planned pricing</span>
        <h2>Free to start. Pro when you&apos;re ready.</h2>
        <p className="lp-plans-sub">Both plans cover your whole club: every team, coach, player and parent. Australian dollars, no GST added.</p>
        <div className="lp-plan-row">
          <article className="lp-plan">
            <span className="lp-plan-name">Lite</span>
            <div className="lp-price">
              <b>Free</b>
            </div>
            <p>Everything a club needs to stay organised.</p>
            <ul className="lp-ticks">
              {LITE.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </article>
          <article className="lp-plan pro">
            <span className="lp-plan-name">
              Pro <span className="pro-badge">MOST POPULAR</span>
            </span>
            <div className="lp-price">
              <b>$60</b>
              <span>per month</span>
            </div>
            <p className="lp-price-year">
              or <b>$600 a year</b>, two months free
            </p>
            <p>Everything in Lite, plus the coaching and club tools:</p>
            <ul className="lp-ticks">
              {PRO.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="lp-plan-small">
              <b>Founding clubs: first season free.</b> Pay monthly and cancel any time. A club with 100 players pays about 60c per player a month.
            </p>
          </article>
        </div>
        <div className="lp-plan-cta">
          <p>We&apos;re running Overlap with Southern Lakes United FC this season, then opening to ten founding clubs.</p>
          <a href="#contact" className="btn primary lp-big">
            Claim a founding spot
          </a>
        </div>
      </section>

      <section className="lp-faq-wrap">
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
          <span className="lp-kicker">Ten founding spots</span>
          <h2>Claim your club&apos;s founding spot</h2>
          <p>Tell us a little about your club. Aidan will get back to you personally, usually within a day.</p>
          <ul className="lp-ticks">
            <li>First season of Pro free</li>
            <li>No cost, card or commitment to claim</li>
            <li>We&apos;ll set your club up for you, players and all</li>
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
