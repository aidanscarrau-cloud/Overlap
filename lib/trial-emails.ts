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
      ? "TEST: this is what families will get. Nothing changes if you press the buttons."
      : undefined,
    kicker: "Trial result",
    subject: `${o.test ? "[Test] " : ""}${first} has been offered a place in ${o.team}`,
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
          `We'll email you a link and a club code to set up your free Overlap account. ${o.club.name} uses Overlap for training times, matches, team chat and player development.`,
          `Create your account and press Join club. You'll be linked to ${first} automatically.`,
          "Reply to training and matches, see the schedule and chat with the team, all from your phone.",
        ],
      },
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
  },
) {
  const first = o.player.split(" ")[0];
  const join = `${o.siteUrl}/join/${o.code}`;
  return {
    to: o.to,
    club: o.club,
    siteUrl: o.siteUrl,
    banner: o.test
      ? "TEST: this is the email families get after they accept. The code below is a sample and won't work."
      : undefined,
    kicker: "Welcome to the club",
    subject: `${o.test ? "[Test] " : ""}Welcome to ${o.club.name}: set up your account`,
    greeting: `Hi ${o.parentName.split(" ")[0] || "there"},`,
    paragraphs: [
      `Great news: ${first} is now part of ${o.team}!`,
      `${o.club.name} uses Overlap for training times, matches, team chat and ${first}'s development. It takes about a minute to set up.`,
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
    footer: `You're getting this because you accepted a place with ${o.club.name}. The code works for 60 days.`,
  };
}
