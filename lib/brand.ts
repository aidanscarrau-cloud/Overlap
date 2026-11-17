/**
 * Club colours → the CSS variables the app uses. Text colours are worked out so they stay readable:
 * - --brand-ink: white or near-black, whichever reads better on the club's main colour
 * - --accent-ink: the same for the accent (buttons)
 * - --accent-text: the accent darkened until it is readable as small text on white (4.5:1)
 */
export const DEFAULT_BRAND = { primary: "#17181c", accent: "#2d5bff" };

type RGB = [number, number, number];
const hexToRgb = (h: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = parseInt(m ? m[1] : "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export const luminance = (h: string) => {
  const [r, g, b] = hexToRgb(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
const DARK = "#15171a";
const inkOn = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, DARK) ? "#ffffff" : DARK);

/** Darken (or lighten) a colour until it reaches the contrast needed on a background. */
function readableOn(color: string, bg: string, need = 4.5) {
  let c = color;
  for (let i = 0; i < 20 && contrast(c, bg) < need; i++) c = mix(c, luminance(bg) > 0.5 ? "#000000" : "#ffffff", 0.08);
  return c;
}

export function brandVars(primary?: string | null, accent?: string | null): Record<string, string> {
  const p = /^#[0-9a-f]{6}$/i.test(primary ?? "") ? primary! : DEFAULT_BRAND.primary;
  const raw = /^#[0-9a-f]{6}$/i.test(accent ?? "") ? accent! : DEFAULT_BRAND.accent;
  // A white (or very pale) accent can't be a button on a white page: use the main colour for buttons then.
  const a = contrast(raw, "#ffffff") < 1.5 ? p : raw;
  return {
    "--brand": p,
    "--brand-2": mix(p, "#000000", 0.35),
    "--brand-ink": inkOn(p),
    "--accent": a,
    "--accent-ink": inkOn(a),
    "--accent-text": readableOn(a, "#ffffff"),
    "--accent-soft": mix(a, "#ffffff", 0.86),
    "--accent-on-brand": contrast(raw, p) >= 3 ? raw : inkOn(p),
  };
}

/** Preset pairs for the colour picker. */
export const BRAND_PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Charcoal & orange", primary: "#1d1d1f", accent: "#f29130" },
  { name: "Navy & gold", primary: "#0f2a5c", accent: "#f5b301" },
  { name: "Royal blue & white", primary: "#1847b8", accent: "#ffffff" },
  { name: "Green & white", primary: "#0f5132", accent: "#34c26b" },
  { name: "Red & black", primary: "#1b1b1b", accent: "#d62828" },
  { name: "Maroon & sky", primary: "#5c0f24", accent: "#58b4e8" },
  { name: "Black & yellow", primary: "#111111", accent: "#ffd400" },
  { name: "Purple & teal", primary: "#3b1f6e", accent: "#1fb5a5" },
];
