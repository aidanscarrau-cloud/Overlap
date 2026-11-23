import type { Metadata } from "next";
import Link from "next/link";
import { InfoShell } from "@/components/landing/InfoShell";
import { ContactForm } from "@/components/landing/ContactForm";
import { UPDATED } from "@/lib/site";

export const metadata: Metadata = { title: "Help & support", description: "Quick answers for parents, players, coaches and club admins, and how to contact Overlap support." };

const FAQ: { group: string; items: [string, React.ReactNode][] }[] = [
  {
    group: "Parents & players",
    items: [
      ["How do I join my club?", <>Open the invite link your club sent by email or text, create an account and press <b>Join club</b>. Your code is filled in for you. No invite? Ask your coach or club secretary.</>],
      ["How do I say if we're coming?", <>Your next training or match is on the Home screen. Tap <b>Yes</b> or <b>No</b>. You can change your answer any time before it starts.</>],
      ["How do I get the app on my phone?", <>It&apos;s free and takes 30 seconds: follow the <Link href="/get-app">step-by-step guide</Link>. On iPhone use Safari, then Share, then Add to Home Screen.</>],
      ["I'm not getting notifications", <>Open Overlap from the icon on your home screen, go to <b>More → Notifications</b>, turn them on and press <b>Send a test notification</b>. On iPhone, notifications only work once Overlap is on your home screen. Check Focus / Do Not Disturb too.</>],
      ["Can both parents use it?", <>Yes. The second parent can use the same invite link or code, or your club can send them their own invite.</>],
      ["How do I tell the coach about an injury?", <>On Home, tap <b>Hurt? Tell the coaches</b>. They&apos;re told straight away and will set the steps back to playing.</>],
      ["Can I put training in my phone calendar?", <>Yes: on <b>Schedule</b>, tap <b>Add to phone calendar</b>. It stays up to date when sessions change.</>],
    ],
  },
  {
    group: "Coaches",
    items: [
      ["How do I take the register?", <>Open the session (from Home or Schedule) and choose the <b>Attendance</b> tab. Tap each player who&apos;s there.</>],
      ["How do I plan a session quickly?", <>On <b>Drills</b>, pick a focus and age, press <b>Suggest</b>, then <b>Add to</b> your next session. Each drill has an animation you can show the players.</>],
      ["How do I set the line-up?", <>On <b>Squad</b>, tap <b>Edit line-up</b>, pick a formation and drag players into place. <b>Save &amp; share</b> tells the team&apos;s other coaches. Line-ups are only visible to coaching staff.</>],
      ["How do trials work?", <>On <b>Trials</b>, set up the dates and share the sign-up link (or import your form&apos;s spreadsheet). Check players in and rate them on the night, then send offers from <b>Selection</b>. Accepting adds the player to your squad.</>],
    ],
  },
  {
    group: "Club admins",
    items: [
      ["How do I get all our players in?", <>On <b>Squad</b>, use <b>Import players</b> and choose the spreadsheet from your registration system (for example a PlayHQ export saved as CSV). Overlap can email each family an invite as it goes.</>],
      ["How do I invite coaches?", <>On <b>Club &amp; members</b>, create an invite for the coach&apos;s team and send them the link.</>],
      ["How do I change our colours and badge?", <>On <b>Club &amp; members</b>, pick your colours and upload your logo. Emails use them too.</>],
      ["Can we get our data out?", <>Yes. On <b>Club &amp; members</b>, press <b>Download all club data</b> for a file with every team, player, session and more. Read how we look after it in our <Link href="/privacy">privacy page</Link>.</>],
    ],
  },
];

export default function Help() {
  return (
    <InfoShell kicker="Help & support" title="How can we help?" updated={UPDATED.help}>
      {FAQ.map((g) => (
        <section key={g.group}>
          <h2>{g.group}</h2>
          <div className="ip-faq">
            {g.items.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <section id="contact">
        <h2>Contact support</h2>
        <p>Can&apos;t find the answer? Send us a message and we&apos;ll reply by email, usually within a day. For anything urgent about a child&apos;s safety, contact your club&apos;s Member Protection Officer first.</p>
        <ContactForm kind="support" />
      </section>
    </InfoShell>
  );
}
