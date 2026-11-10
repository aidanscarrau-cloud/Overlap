"use client";

import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";

export function SheetFrame({ title, children, foot }: { title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  const { close } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}

/** A destructive button that asks for a second click before acting. */
export function ConfirmButton({ label, onConfirm, className = "btn danger spacer", disabled }: { label: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className}${armed ? " armed" : ""}`} disabled={disabled} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? "Click again to confirm" : label}
    </button>
  );
}

export function ReadOnlyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="readonly-note">
      <svg className="i" aria-hidden="true">
        <use href="#i-people" />
      </svg>
      {children}
    </div>
  );
}
