import "server-only";
import type { EmailClub } from "./email-server";

/* The offer and welcome emails families get from trials, in one place so the real ones and the test ones match. */

type Base = { club: EmailClub; siteUrl: string; to: string };

export function offerEmail(
  o: Base & {
    player: string;
    parentName: string;
    team: string;
    trialTitle: string;
    url: string;
    message?: string;
    coach?: string;
    cc?: string;
    replyTo?: string;
    test?: boolean;
  },
) {
  const first = o.player.split(" ")[0];
  const sign = o.coach ? `${o.coach}, ${o.club.name}` : o.club.name;
  return {
    to: o.to,
    cc: o.cc,
    replyTo: o.replyTo,
    club: o.club,
    siteUrl: o.siteUrl,
    banner: o.test
      ? "TEST EMAIL 1 OF 3 – THE OFFER. Families get this when you press Send offer on a player. It asks them to accept or decline the place. Nothing changes if you press the buttons."
      : undefined,
    kicker: "Trial result",
    subject: `${o.test ? "[Test 1 of 3: Offer] " : ""}${first} has been offered a place in ${o.team}`,
    greeting: `Hi ${o.parentName.split(" ")[0] || "there"},`,
    paragraphs: [
      `Thanks for coming along to ${o.trialTitle}. We'd love ${first} to join ${o.team}!`,
      ...(o.message ? [o.message] : []),
      "Please let us know if you'd like the place using the button below.",
      `– ${sign}`,
    ],
    button: { label: "Accept the place", url: o.url },
    second: {
      label: "Decline",
      url: `${o.url}${o.url.includes("?") ? "&" : "?"}decline=1`,
    },
    steps: [
      {
        heading: "What happens next",
        items: [
          `Press Accept the place. ${first} is added to the ${o.team} squad straight away.`,
          `We'll email you a link and a club code to set up your free Overlap account. ${o.club.name} is trialling Overlap for training times, matches, team chat and player development.`,
          `Create your account and press Join club. You'll be linked to ${first} automatically.`,
          "Reply to training and matches, see the schedule and chat with the team, all from your phone.",
        ],
      },
    ],
    footer: `You're getting this because ${first} trialled with ${o.club.name}.`,
  };
}

/** "Unfortunately not this time": a kind no for families whose child wasn't picked. */
export function notSelectedEmail(
  o: Base & {
    player: string;
    parentName: string;
    team: string;
    trialTitle: string;
    message?: string;
    coach?: string;
    cc?: string;
    replyTo?: string;
    test?: boolean;
  },
) {
  const first = o.player.split(" ")[0];
  const sign = o.coach ? `${o.coach}, ${o.club.name}` : o.club.name;
  return {
    to: o.to,
    cc: o.cc,
    replyTo: o.replyTo,
    club: o.club,
    siteUrl: o.siteUrl,
    banner: o.test ? "TEST EMAIL 3 OF 3 – NOT SELECTED. Families get this when you press Not this time on a player (you can untick emailing if you've told them in person)." : undefined,
    kicker: "Trial result",
    subject: `${o.test ? "[Test 3 of 3: Not selected] " : ""}${o.trialTitle}: thank you for trialling`,
    greeting: `Hi ${o.parentName.split(" ")[0] || "there"},`,
    paragraphs: [
      `Thank you for bringing ${first} to ${o.trialTitle}. We really enjoyed having ${first} along.`,
      `Unfortunately, we're not able to offer ${first} a place in ${o.team} this time. We had lots of good players and only a few spots, so it was a hard decision.`,
      ...(o.message ? [o.message] : []),
      `Please don't let this stop ${first} playing. We'd love to see ${first} keep at it and come along to our next trials.`,
      "If you'd like some feedback, just reply to this email.",
      `– ${sign}`,
    ],
    footer: `You're getting this because ${first} trialled with ${o.club.name}.`,
  };
}

export function welcomeEmail(
  o: Base & {
    player: string;
    parentName: string;
    team: string;
    code: string;
    test?: boolean;
    /** "invite": the club is moving the family onto Overlap (not a trial offer). */
    mode?: "trial" | "invite";
  },
) {
  const first = o.player.split(" ")[0];
  const join = `${o.siteUrl}/join/${o.code}`;
  const invite = o.mode === "invite";
  return {
    to: o.to,
    club: o.club,
    siteUrl: o.siteUrl,
    banner: o.test
      ? "TEST EMAIL 2 OF 3 – WELCOME. Families get this automatically once they press Accept on the offer. It's how they set up their Overlap account. The code below is a sample and won't work."
      : undefined,
    kicker: invite ? "You're invited" : "Welcome to the club",
    subject: invite ? `${o.club.name}: join ${first}'s team on Overlap` : `${o.test ? "[Test 2 of 3: Welcome] " : ""}Welcome to ${o.club.name}: set up your account`,
    greeting: `Hi ${o.parentName.split(" ")[0] || "there"},`,
    paragraphs: [
      invite ? `${o.club.name} is moving ${o.team} onto Overlap, and ${first} is already in the squad.` : `Great news: ${first} is now part of ${o.team}!`,
      `${o.club.name} is trialling Overlap for training times, matches, team chat and ${first}'s development. It takes about a minute to set up.`,
    ],
    code: { label: "Your club code", value: o.code },
    button: { label: "Set up my account", url: join },
    steps: [
      {
        heading: "How to set up your account",
        items: [
          "Press Set up my account above. It opens Overlap with your club code already filled in.",
          "Enter your name, email and a password to create your account. Already use Overlap? Choose Sign in instead.",
          "If asked, check your inbox and confirm your email address.",
          `Your club code is already filled in. Press Join club and you're in, linked to ${first}. (If the code box is ever empty, type ${o.code}.)`,
          "A second parent or guardian can use the same button and code.",
        ],
      },
      {
        heading: "Get the app on your phone (free, 30 seconds)",
        items: [
          "iPhone: open Overlap in Safari, tap the Share button (the square with an arrow pointing up), then Add to Home Screen, then Add.",
          "Android: open Overlap in Chrome, tap the three dots ⋮ in the top corner, then Install app (or Add to Home screen).",
          "Open Overlap from the new icon on your home screen and allow notifications, so you hear straight away when training changes or a match is on.",
        ],
        link: {
          label: "Step-by-step guide with pictures",
          url: `${o.siteUrl}/get-app`,
        },
      },
    ],
    footer: invite ? `You're getting this because ${o.club.name} added ${first} to ${o.team} on Overlap. The code works for 60 days.` : `You're getting this because you accepted a place with ${o.club.name}. The code works for 60 days.`,
  };
}
