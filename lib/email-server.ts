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
  transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, pool: true, maxConnections: 3 });
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Email headers can't contain line breaks or the sender's name quotes. */
const plainName = (s: string) => s.replace(/[\r\n"<>]/g, " ").trim().slice(0, 80);

export type EmailItem = { title: string; body: string; url: string };
export type EmailClub = { name: string; logo?: string | null; primary?: string | null; accent?: string | null };

/** Just the address from EMAIL_FROM, which may be "Name <address>" or a bare address. */
function senderAddress() {
  const raw = (process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  return raw.match(/<([^>]+)>/)?.[1]?.trim() || raw;
}

/** One email per person, listing everything new for them, in their club's colours with its badge. */
export async function sendNotificationEmail(opts: { to: string; name: string; club: EmailClub; items: EmailItem[]; siteUrl: string }) {
  const t = mailer();
  if (!t) return false;
  const { to, name, club, items, siteUrl } = opts;
  const clubName = club.name;
  const v = brandVars(club.primary, club.accent);
  const brand = v["--brand"], brand2 = v["--brand-2"], brandInk = v["--brand-ink"], accent = v["--accent"], accentInk = v["--accent-ink"];
  const accentText = v["--accent-text"], kicker = v["--accent-on-brand"];
  const logo = club.logo && /^https:\/\/[^\s"'<>]+$/.test(club.logo) ? club.logo : `${siteUrl}/email/overlap-logo.png`;
  const link = (u: string) => siteUrl + (u.startsWith("/") ? u : "/");
  const first = name.split(" ")[0];
  const subject = items.length === 1 ? items[0].title : `${items.length} updates from ${clubName}`;
  const font = "Arial,Helvetica,sans-serif";

  const text = [
    first ? `Hi ${first},` : "Hi,",
    "",
    ...items.flatMap((i) => [i.title, ...(i.body ? [i.body] : []), link(i.url), ""]),
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
    <a href="${esc(siteUrl)}/" style="display:inline-block;padding:13px 22px;font:bold 15px/18px ${font};color:${accentInk};text-decoration:none;border-radius:12px">Open ${esc(clubName)} &rarr;</a>
  </td></tr></table>
</td></tr>

<tr><td align="center" style="padding:18px 16px 0;font:12px/18px ${font};color:#8b919c">
  You&rsquo;re getting this because you&rsquo;re a member of ${esc(clubName)} on Overlap.<br>
  <a href="${esc(siteUrl)}/notifications" style="color:#5b6472">Change what we email you</a> &middot; <b style="color:#5b6472">Overlap</b>, the club hub
</td></tr>
</table></td></tr></table></body></html>`;

  await t.sendMail({ from: `"${plainName(clubName)} via Overlap" <${senderAddress()}>`, to, subject: subject.slice(0, 200), text, html });
  return true;
}
