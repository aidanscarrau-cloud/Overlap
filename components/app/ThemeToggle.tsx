"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "auto";

/** Light, dark or match the phone. Remembered on this device. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [t, setT] = useState<Theme>("light");
  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    setT(cur === "dark" || cur === "auto" ? cur : "light");
  }, []);
  function pick(v: Theme) {
    setT(v);
    document.documentElement.dataset.theme = v;
    try {
      localStorage.setItem("overlap-theme", v);
    } catch {}
  }
  return (
    <div className={`seg theme-seg${compact ? " sm" : ""}`} role="radiogroup" aria-label="Appearance">
      {(
        [
          ["light", compact ? "Light" : "☀︎ Light"],
          ["dark", compact ? "Dark" : "☾ Dark"],
          ["auto", "Auto"],
        ] as const
      ).map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={t === k} aria-selected={t === k} onClick={() => pick(k)} title={k === "auto" ? "Match your phone or computer" : undefined}>
          {l}
        </button>
      ))}
    </div>
  );
}
