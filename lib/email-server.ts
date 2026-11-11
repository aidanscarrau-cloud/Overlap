import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

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

/** One email per person, listing everything new for them. */
export async function sendNotificationEmail(opts: { to: string; name: string; clubName: string; items: EmailItem[]; siteUrl: string }) {
  const t = mailer();
  if (!t) return false;
  const { to, name, clubName, items, siteUrl } = opts;
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER!;
  const link = (u: string) => siteUrl + (u.startsWith("/") ? u : "/");
  const first = name.split(" ")[0];
  const subject = items.length === 1 ? items[0].title : `${items.length} updates from ${clubName}`;

  const text = [
    first ? `Hi ${first},` : "Hi,",
    "",
    ...items.flatMap((i) => [i.title, ...(i.body ? [i.body] : []), link(i.url), ""]),
    `Change what ${clubName} emails you: ${siteUrl}/notifications`,
  ].join("\n");

  const rows = items
    .map(
      (i) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e9e9e7">
<div style="font-size:16px;font-weight:600;color:#191919">${esc(i.title)}</div>
${i.body ? `<div style="font-size:15px;color:#55534e;margin-top:2px">${esc(i.body)}</div>` : ""}
<a href="${esc(link(i.url))}" style="display:inline-block;margin-top:8px;font-size:15px;color:#2383e2;text-decoration:none;font-weight:500">Open in Overlap &rarr;</a>
</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff">
<div style="max-width:520px;margin:0 auto;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#37352f">
<div style="font-size:14px;color:#787774">${esc(clubName)}</div>
<p style="font-size:16px;margin:16px 0 4px">${first ? `Hi ${esc(first)},` : "Hi,"}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
<p style="font-size:13px;color:#9b9a97;margin-top:20px">You're getting this because you're a member of ${esc(clubName)} on Overlap.
<a href="${esc(siteUrl)}/notifications" style="color:#787774">Change what we email you</a>.</p>
</div></body></html>`;

  await t.sendMail({ from: `"${plainName(clubName)} via Overlap" <${fromAddress}>`, to, subject: subject.slice(0, 200), text, html });
  return true;
}
