const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const todayIso = () => iso(new Date());
export const hhmm = (t: string) => (t || "18:00").slice(0, 5);
export const fmtDay = (s: string) => parseD(s).toLocaleDateString("en-AU", { weekday: "short" });
export const fmtNum = (s: string) => parseD(s).getDate();
export const fmtMon = (s: string) => parseD(s).toLocaleDateString("en-AU", { month: "short" });
export const fmtLongDay = (s: string) => parseD(s).toLocaleDateString("en-AU", { weekday: "long" });
export const fmtLongMon = (s: string) => parseD(s).toLocaleDateString("en-AU", { month: "long" });
export const addMins = (t: string, m: number) => {
  const [h, mm] = hhmm(t).split(":").map(Number);
  const x = h * 60 + mm + m;
  return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
};
export const daysUntil = (s: string) => Math.round((parseD(s).getTime() - parseD(todayIso()).getTime()) / 864e5);
export const whenLabel = (s: string) => {
  const n = daysUntil(s);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
};
export const weekKey = (s: string) => {
  const d = parseD(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};
export const weekLabel = (k: string) => {
  const diff = Math.round((parseD(k).getTime() - parseD(weekKey(todayIso())).getTime()) / (7 * 864e5));
  if (diff === 0) return "This week";
  if (diff === 1) return "Next week";
  if (diff === -1) return "Last week";
  return "Week of " + parseD(k).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
};
export const initials = (n: string) =>
  String(n || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
export const errMsg = (e: unknown) =>
  (e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "") || "Something went wrong. Try again.";
