import type { Metadata } from "next";
import Link from "next/link";
import { InfoShell } from "@/components/landing/InfoShell";
import { DATA_REGION, UPDATED } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy & child safety", description: "What Overlap stores, who can see it, and how we look after children's information." };

/* Plain-English privacy and child-safety page, written for club committees and parents. */

export default function Privacy() {
  return (
    <InfoShell kicker="Privacy & child safety" title="How Overlap looks after your club's information" updated={UPDATED.privacy}>
      <section>
        <h2>The short version</h2>
        <ul className="ip-ticks">
          <li>Each club&apos;s information is only visible to that club. Clubs can&apos;t see each other&apos;s data.</li>
          <li>Inside a club, people only see what their role needs: families see their own child, coaches see their teams.</li>
          <li>We don&apos;t sell data, show ads, or share it with anyone for marketing.</li>
          <li>Team chat is off for younger players by default, and private messages are never open to players.</li>
          <li>Clubs can download all of their data at any time, and ask us to delete it.</li>
        </ul>
      </section>

      <section>
        <h2>Who we are</h2>
        <p>
          Overlap is a club app for grassroots football, built and run by Aidan Scarr in Newcastle, Australia. The club that invites you decides who joins and what they can do; Overlap provides and looks after the app. If you have a question about your own information, you can ask your
          club, or contact us using the <Link href="/help#contact">contact form</Link> (choose &ldquo;Privacy request&rdquo;).
        </p>
      </section>

      <section>
        <h2>What we store</h2>
        <table className="ip-table">
          <tbody>
            <tr>
              <th>Accounts</th>
              <td>Name, email address and a securely stored password (or sign-in links). Your role at the club (admin, coach, assistant, parent or player).</td>
            </tr>
            <tr>
              <th>Players</th>
              <td>Name, team(s), position, shirt number, birth year (used for age groups and chat settings), and whether they&apos;re available or injured.</td>
            </tr>
            <tr>
              <th>Training &amp; matches</th>
              <td>Session plans, who replied and who attended, match squads, line-ups, minutes, goals and assists.</td>
            </tr>
            <tr>
              <th>Development &amp; fitness</th>
              <td>Coach ratings, goals and notes, self-reviews, and fitness test results.</td>
            </tr>
            <tr>
              <th>Injuries</th>
              <td>What the injury is, when it happened, notes, and the return-to-play step. This is health information, so it is only visible to the player&apos;s own family and the coaches and admins of their team.</td>
            </tr>
            <tr>
              <th>Messages</th>
              <td>Team, group and private chat messages, reactions and photos, and club announcements.</td>
            </tr>
            <tr>
              <th>Trials</th>
              <td>What families enter on a trial sign-up form: player name, date of birth, current club, positions, parent contact details and the boxes they ticked (for example filming consent). Only that team&apos;s coaches and the club&apos;s admins can see it.</td>
            </tr>
            <tr>
              <th>Devices</th>
              <td>If you turn on notifications, the address your phone gives us for sending them. Basic technical logs needed to keep the service running and secure.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Who can see what</h2>
        <ul>
          <li>
            <b>Parents and players</b> see their own player&apos;s schedule, replies, development, fitness and injuries, team chat (if allowed for their age) and club news.
          </li>
          <li>
            <b>Coaches and assistants</b> see the teams they work with. What they can change is set by the club&apos;s admins.
          </li>
          <li>
            <b>Club admins</b> manage members, roles and settings for their club.
          </li>
          <li>
            <b>Overlap</b> only looks at a club&apos;s information when it&apos;s needed to provide support, fix a problem, or when the law requires it.
          </li>
        </ul>
        <p>These rules are enforced by the database itself, not just by the screens you see, so a person can&apos;t get around them by changing a link.</p>
      </section>

      <section>
        <h2>Children and young players</h2>
        <ul>
          <li>Children usually join through a parent. Parents can see everything about their own child.</li>
          <li>Each club chooses the age from which players can use team chat. Younger players can&apos;t see chat at all unless the club changes this.</li>
          <li>Private messages between an adult and a player are never available, whatever the settings.</li>
          <li>Concussion injuries can&apos;t be moved to full training or marked recovered without a doctor&apos;s clearance being recorded.</li>
          <li>
            <b>Photos:</b> photos shared in chat are only visible to members of that chat. Clubs should follow their own photo and filming consent policy; trial sign-up forms can record a filming consent box.
          </li>
          <li>If you&apos;re worried about something you&apos;ve seen in the app, tell your club&apos;s Member Protection Officer and contact us.</li>
        </ul>
      </section>

      <section>
        <h2>Where it&apos;s kept and how it&apos;s protected</h2>
        <p>
          Overlap runs on established cloud providers: the database and file storage on Supabase{DATA_REGION ? ` (in ${DATA_REGION})` : ""}, and the website on Vercel. Information is sent over encrypted connections, passwords are never stored in
          plain text, and photos are kept in private storage that only the right chat members can open.
        </p>
      </section>

      <section>
        <h2>How long we keep it, and deleting it</h2>
        <ul>
          <li>Information stays while your club uses Overlap. Club admins can remove players and members at any time.</li>
          <li>A parent can ask their club, or us, to delete their child&apos;s information.</li>
          <li>Club admins can download a full copy of the club&apos;s data from the Club page whenever they like.</li>
          <li>If a club stops using Overlap, we delete its information when the club asks.</li>
        </ul>
      </section>

      <section>
        <h2>Emails and notifications</h2>
        <p>
          We send emails and phone notifications about your club: sign-in links, session changes, messages, trial results and similar. You can change what you get on the Notifications page. We don&apos;t send marketing emails to
          families.
        </p>
      </section>

      <section>
        <h2>Questions or requests</h2>
        <p>
          To see, correct or delete your information, or to raise a concern, use the <Link href="/help#contact">contact form</Link> and choose &ldquo;Privacy request&rdquo;. If you&apos;re not happy with our answer, you can contact the
          Office of the Australian Information Commissioner (oaic.gov.au).
        </p>
      </section>
    </InfoShell>
  );
}
