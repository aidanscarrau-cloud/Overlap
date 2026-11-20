import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { brandVars } from "./brand";

/**
 * Sends notification emails through any SMTP provider (Brevo, Resend, Gmail, your club's mail...).
 * Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM; SMTP_PORT is optional (587, or 465 for SSL).
 */
let transport: Transporter | null | undefined;
export function mailer() {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return (transport = null);
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
  });
  return transport;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Email headers can't contain line breaks or the sender's name quotes. */
const plainName = (s: string) =>
  s
    .replace(/[\r\n"<>]/g, " ")
    .trim()
    .slice(0, 80);

export type EmailItem = { title: string; body: string; url: string };
export type EmailClub = {
  name: string;
  logo?: string | null;
  primary?: string | null;
  accent?: string | null;
};

/** Just the address from EMAIL_FROM, which may be "Name <address>" or a bare address. */
function senderAddress() {
  const raw = (process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  return raw.match(/<([^>]+)>/)?.[1]?.trim() || raw;
}

/** One email per person, listing everything new for them, in their club's colours with its badge. */
export async function sendNotificationEmail(opts: {
  to: string;
  name: string;
  club: EmailClub;
  items: EmailItem[];
  siteUrl: string;
}) {
  const t = mailer();
  if (!t) return false;
  const { to, name, club, items, siteUrl } = opts;
  const clubName = club.name;
  const v = brandVars(club.primary, club.accent);
  const brand = v["--brand"],
    brand2 = v["--brand-2"],
    brandInk = v["--brand-ink"],
    accent = v["--accent"],
    accentInk = v["--accent-ink"];
  const accentText = v["--accent-text"],
    kicker = v["--accent-on-brand"];
  const logo =
    club.logo && /^https:\/\/[^\s"'<>]+$/.test(club.logo)
      ? club.logo
      : `${siteUrl}/email/overlap-logo.png`;
  // The app lives at /home; "/" is the public front page.
  const link = (u: string) => siteUrl + (u.startsWith("/") && u !== "/" ? u : "/home");
  const first = name.split(" ")[0];
  const subject =
    items.length === 1
      ? items[0].title
      : `${items.length} updates from ${clubName}`;
  const font = "Arial,Helvetica,sans-serif";

  const text = [
    first ? `Hi ${first},` : "Hi,",
    "",
    ...items.flatMap((i) => [
      i.title,
      ...(i.body ? [i.body] : []),
      link(i.url),
      "",
    ]),
    `Change what ${clubName} emails you: ${siteUrl}/notifications`,
  ].join("\n");

  const rows = items
    .map(
      (i, n) => `<tr><td style="padding:${n ? "12px" : "0"} 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
<td width="4" bgcolor="${accent}" style="width:4px;background:${accent};border-radius:4px 0 0 4px;font-size:0;line-height:0">&nbsp;</td>
<td bgcolor="#f6f7f9" style="background:#f6f7f9;border-radius:0 14px 14px 0;padding:14px 16px">
<div style="font:bold 16px/22px ${font};color:#15171a">${esc(i.title)}</div>
${i.body ? `<div style="font:15px/22px ${font};color:#4b5563;margin-top:3px">${esc(i.body)}</div>` : ""}
<a href="${esc(link(i.url))}" style="display:inline-block;margin-top:10px;font:bold 14px/18px ${font};color:${accentText};text-decoration:none">Open in Overlap &rarr;</a>
</td></tr></table>
</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(items[0]?.body || items[0]?.title || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f3" style="background:#eef0f3"><tr><td align="center" style="padding:26px 12px 34px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px">

<tr><td bgcolor="${brand}" style="background:${brand};background-image:linear-gradient(160deg,${brand} 0%,${brand2} 100%);border-radius:22px 22px 0 0;padding:22px 26px 22px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="60" valign="middle" style="width:60px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:5px;line-height:0">
        <img src="${esc(logo)}" width="46" height="46" alt="${esc(clubName)}" style="display:block;width:46px;height:46px;border:0;object-fit:contain">
      </td></tr></table>
    </td>
    <td valign="middle" style="padding-left:14px">
      <div style="font:bold 11px/14px ${font};letter-spacing:2px;text-transform:uppercase;color:${kicker}">${items.length === 1 ? "New from your club" : `${items.length} updates`}</div>
      <div style="font:bold 22px/26px ${font};color:${brandInk};margin-top:2px">${esc(clubName)}</div>
    </td>
  </tr></table>
</td></tr>

<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:22px 26px 8px">
  <p style="margin:0 0 16px;font:16px/24px ${font};color:#15171a">${first ? `Hi ${esc(first)},` : "Hi,"} here&rsquo;s what&rsquo;s new.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 22px 22px;padding:16px 26px 24px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${accent}" style="border-radius:12px">
    <a href="${esc(siteUrl)}/home" style="display:inline-block;padding:13px 22px;font:bold 15px/18px ${font};color:${accentInk};text-decoration:none;border-radius:12px">Open ${esc(clubName)} &rarr;</a>
  </td></tr></table>
</td></tr>

<tr><td align="center" style="padding:18px 16px 0;font:12px/18px ${font};color:#8b919c">
  You&rsquo;re getting this because you&rsquo;re a member of ${esc(clubName)} on Overlap.<br>
  <a href="${esc(siteUrl)}/notifications" style="color:#5b6472">Change what we email you</a> &middot; <b style="color:#5b6472">Overlap</b>, the club hub
</td></tr>
</table></td></tr></table></body></html>`;

  await t.sendMail({
    from: `"${plainName(clubName)} via Overlap" <${senderAddress()}>`,
    to,
    subject: subject.slice(0, 200),
    text,
    html,
  });
  return true;
}

/**
 * A one-off email from the club to someone who may not be on Overlap yet (trial sign-ups, offers):
 * the club's badge and colours, a few short paragraphs, optional detail rows and up to two buttons.
 */
export async function sendClubMessage(opts: {
  to: string;
  cc?: string;
  replyTo?: string;
  club: EmailClub;
  siteUrl: string;
  kicker: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  rows?: { label: string; value: string }[];
  /** Numbered lists under the main message ("what happens next", "get the app"), each with an optional link. */
  steps?: {
    heading: string;
    items: string[];
    link?: { label: string; url: string };
  }[];
  /** A highlighted box, e.g. an invite code. */
  code?: { label: string; value: string };
  /** Shown above everything when this is a test send. */
  banner?: string;
  button?: { label: string; url: string };
  second?: { label: string; url: string };
  footer: string;
}) {
  const t = mailer();
  if (!t) return false;
  const { club, siteUrl } = opts;
  const v = brandVars(club.primary, club.accent);
  const brand = v["--brand"],
    brand2 = v["--brand-2"],
    brandInk = v["--brand-ink"],
    accent = v["--accent"],
    accentInk = v["--accent-ink"];
  const accentText = v["--accent-text"],
    kicker = v["--accent-on-brand"];
  const logo =
    club.logo && /^https:\/\/[^\s"'<>]+$/.test(club.logo)
      ? club.logo
      : `${siteUrl}/email/overlap-logo.png`;
  const font = "Arial,Helvetica,sans-serif";
  const text = [
    opts.greeting,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.rows ?? []).map((r) => `${r.label}: ${r.value}`),
    ...(opts.rows?.length ? [""] : []),
    ...(opts.code ? [`${opts.code.label}: ${opts.code.value}`, ""] : []),
    ...(opts.steps ?? []).flatMap((b) => [
      b.heading,
      ...b.items.map((x, i) => `${i + 1}. ${x}`),
      ...(b.link ? [`${b.link.label}: ${b.link.url}`] : []),
      "",
    ]),
    ...(opts.button ? [`${opts.button.label}: ${opts.button.url}`] : []),
    ...(opts.second ? [`${opts.second.label}: ${opts.second.url}`] : []),
    "",
    opts.footer,
  ].join("\n");
  const rows = (opts.rows ?? [])
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;border-top:1px solid #e9ebef;font:13px/19px ${font};color:#6b7280;width:120px;vertical-align:top">${esc(r.label)}</td><td style="padding:6px 0 6px 10px;border-top:1px solid #e9ebef;font:bold 14px/19px ${font};color:#15171a">${esc(r.value)}</td></tr>`,
    )
    .join("");
  const btn = (b: { label: string; url: string }, primary: boolean) =>
    primary
      ? `<td bgcolor="${accent}" style="border-radius:12px"><a href="${esc(b.url)}" style="display:inline-block;padding:13px 22px;font:bold 15px/18px ${font};color:${accentInk};text-decoration:none;border-radius:12px">${esc(b.label)}</a></td>`
      : `<td style="padding-left:14px"><a href="${esc(b.url)}" style="font:bold 14px/18px ${font};color:${accentText};text-decoration:none">${esc(b.label)}</a></td>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.paragraphs[0] ?? "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f3" style="background:#eef0f3"><tr><td align="center" style="padding:26px 12px 34px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px">
${opts.banner ? `<tr><td style="padding:0 0 10px"><div style="background:#fff4e5;border:1px solid #f5c98b;border-radius:12px;padding:10px 14px;font:bold 13px/18px ${font};color:#7a3e00">${esc(opts.banner)}</div></td></tr>` : ""}
<tr><td bgcolor="${brand}" style="background:${brand};background-image:linear-gradient(160deg,${brand} 0%,${brand2} 100%);border-radius:22px 22px 0 0;padding:22px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="60" valign="middle" style="width:60px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:5px;line-height:0">
      <img src="${esc(logo)}" width="46" height="46" alt="${esc(club.name)}" style="display:block;width:46px;height:46px;border:0;object-fit:contain"></td></tr></table></td>
    <td valign="middle" style="padding-left:14px">
      <div style="font:bold 11px/14px ${font};letter-spacing:2px;text-transform:uppercase;color:${kicker}">${esc(opts.kicker)}</div>
      <div style="font:bold 22px/26px ${font};color:${brandInk};margin-top:2px">${esc(club.name)}</div>
    </td></tr></table>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:22px 26px 6px">
  <p style="margin:0 0 14px;font:16px/24px ${font};color:#15171a">${esc(opts.greeting)}</p>
  ${opts.paragraphs.map((p) => `<p style="margin:0 0 14px;font:15px/23px ${font};color:#374151">${esc(p)}</p>`).join("")}
  ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px">${rows}</table>` : ""}
  ${opts.code ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 16px"><tr><td bgcolor="#f6f7f9" style="background:#f6f7f9;border:2px dashed #d0d5dd;border-radius:14px;padding:12px 18px"><div style="font:bold 11px/14px ${font};letter-spacing:1.5px;text-transform:uppercase;color:#6b7280">${esc(opts.code.label)}</div><div style="font:bold 26px/32px 'Courier New',monospace;letter-spacing:4px;color:#15171a">${esc(opts.code.value)}</div></td></tr></table>` : ""}
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 22px 22px;padding:8px 26px 24px">
  ${opts.button || opts.second ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${opts.button ? btn(opts.button, true) : ""}${opts.second ? btn(opts.second, false) : ""}</tr></table>` : ""}
  ${(opts.steps ?? [])
    .map(
      (b) =>
        `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e9ebef"><div style="font:bold 15px/20px ${font};color:#15171a;margin-bottom:10px">${esc(b.heading)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${b.items
          .map(
            (x, i) =>
              `<tr><td width="34" valign="top" style="width:34px;padding:0 0 10px"><div style="width:24px;height:24px;border-radius:12px;background:${accent};color:${accentInk};font:bold 13px/24px ${font};text-align:center">${i + 1}</div></td><td valign="top" style="padding:2px 0 10px;font:14px/21px ${font};color:#374151">${esc(x)}</td></tr>`,
          )
          .join(
            "",
          )}</table>${b.link ? `<a href="${esc(b.link.url)}" style="display:inline-block;margin-top:2px;font:bold 14px/18px ${font};color:${accentText};text-decoration:none">${esc(b.link.label)} &rarr;</a>` : ""}</div>`,
    )
    .join("")}
</td></tr>
<tr><td align="center" style="padding:18px 16px 0;font:12px/18px ${font};color:#8b919c">${esc(opts.footer)}<br><b style="color:#5b6472">Overlap</b>, the club hub</td></tr>
</table></td></tr></table></body></html>`;
  await t.sendMail({
    from: `"${plainName(club.name)} via Overlap" <${senderAddress()}>`,
    to: opts.to,
    ...(opts.cc ? { cc: opts.cc } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    subject: opts.subject.slice(0, 200),
    text,
    html,
  });
  return true;
}
