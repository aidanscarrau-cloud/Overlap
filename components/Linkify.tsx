import { Fragment } from "react";

// Australian-style street addresses: "12 Smith St", "3/21 King George Rd Bexley NSW 2207",
// "45 Ocean Parade, Coogee". Needs a number, a capitalised street name and a street type.
const TYPES =
  "Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Parade|Pde|Crescent|Cres|Court|Ct|Place|Pl|Highway|Hwy|Boulevard|Blvd|Terrace|Tce|Close|Cl|Way|Circuit|Cct|Grove|Gr|Esplanade|Esp|Square|Sq";
const STATES = "NSW|VIC|Vic|QLD|Qld|SA|WA|TAS|Tas|NT|ACT";
const W = "[A-Z][A-Za-z'’-]+";
const SUB = `${W}(?:\\s+${W}){0,2}`;
const ADDRESS = `\\b\\d{1,5}[A-Za-z]?(?:[-/]\\d{1,5}[A-Za-z]?)?\\s+(?:${W}\\s+){1,3}(?:${TYPES})\\b(?:,\\s*${SUB}(?:,?\\s+(?:${STATES}))?(?:\\s+\\d{4})?|\\s+${SUB}\\s+(?:${STATES})(?:\\s+\\d{4})?)?`;
const URL = `https?:\\/\\/[^\\s<>"]+|www\\.[^\\s<>"]+\\.[^\\s<>"]+`;
const EMAIL = `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}`;
const PATTERN = new RegExp(`(${URL})|(${EMAIL})|(${ADDRESS})`, "g");
const TRAILING = /[.,;:!?)\]}'"]+$/;

export const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * Shows plain text with web addresses, email addresses and street addresses turned into links.
 * Only https/http, mailto and Google Maps links are ever created.
 */
export function Linkify({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    let raw = m[0];
    const kind = m[1] ? "url" : m[2] ? "email" : "address";
    if (kind === "url") {
      // Leave trailing punctuation (end of a sentence, closing bracket) outside the link.
      const trail = raw.match(TRAILING)?.[0] ?? "";
      if (trail) raw = raw.slice(0, -trail.length);
    }
    if (start > last) parts.push(text.slice(last, start));
    if (kind === "address") {
      parts.push(
        <a key={start} href={mapsLink(raw)} target="_blank" rel="noopener noreferrer nofollow" className="autolink addr" title="Open in Google Maps">
          <svg className="i" aria-hidden="true">
            <use href="#i-pin" />
          </svg>
          {raw}
        </a>,
      );
    } else {
      const href = kind === "email" ? `mailto:${raw}` : raw.startsWith("http") ? raw : `https://${raw}`;
      parts.push(
        <a key={start} href={href} target={kind === "email" ? undefined : "_blank"} rel="noopener noreferrer nofollow" className="autolink">
          {raw}
        </a>,
      );
    }
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? <Fragment key={"t" + i}>{p}</Fragment> : p))}</>;
}
