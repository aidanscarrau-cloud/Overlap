import { Fragment } from "react";

// Web addresses (https://…, http://…, www.…) and email addresses.
const PATTERN = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Shows plain text with any web or email addresses turned into links. Only http(s) and mailto links are created. */
export function Linkify({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    let raw = m[0];
    // Leave trailing punctuation (end of a sentence, closing bracket) outside the link.
    const trail = raw.match(TRAILING)?.[0] ?? "";
    if (trail) raw = raw.slice(0, -trail.length);
    if (start > last) parts.push(text.slice(last, start));
    const isEmail = raw.includes("@") && !raw.includes("/");
    const href = isEmail ? `mailto:${raw}` : raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push(
      <a key={start} href={href} target={isEmail ? undefined : "_blank"} rel="noopener noreferrer nofollow" className="autolink">
        {raw}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? <Fragment key={"t" + i}>{p}</Fragment> : p))}</>;
}
