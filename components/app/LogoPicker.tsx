"use client";

import { useRef, useState } from "react";
import { Crest } from "@/components/ui";

/** Shows the current logo with buttons to upload a new one or remove it. Also accepts drag-and-drop. */
export function LogoPicker({
  url,
  label,
  help,
  onPick,
  onRemove,
  disabled,
}: {
  url: string | null;
  label: string;
  help?: string;
  onPick: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");

  async function run(fn: () => Promise<void>) {
    setErr("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String((e as { message?: string })?.message || "Upload failed. Try again."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      className={`logo-pick${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !disabled) run(() => onPick(f));
      }}
    >
      <Crest url={url} size={72} className="logo-pick-img" />
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <b>{label}</b>
        <span className="muted" style={{ fontSize: 13 }}>
          {help ?? "PNG, JPG or WebP. Square images with a transparent background look best. You can also drag an image here."}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" disabled={busy || disabled} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : url ? "Change" : "Upload logo"}
          </button>
          {url && (
            <button type="button" className="btn sm danger" disabled={busy || disabled} onClick={() => run(onRemove)}>
              Remove
            </button>
          )}
        </div>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(() => onPick(f));
        }}
      />
    </div>
  );
}
