"use client";

import { useEffect } from "react";
import { isStaleBuild, reloadOnce } from "@/lib/chunk-reload";

// Shown instead of a blank "Application error" if a page breaks. After an update it just reloads.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBuild(error?.message ?? "");
  useEffect(() => {
    if (stale) reloadOnce();
  }, [stale]);
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>{stale ? "Updating Overlap…" : "Something went wrong"}</h1>
        <p style={{ color: "#555f6d", margin: "0 0 18px" }}>{stale ? "A new version is ready. One moment." : "Sorry about that. Try again, and if it keeps happening let your club know."}</p>
        <button onClick={() => (stale ? window.location.reload() : reset())} style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#17181c", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
          {stale ? "Reload" : "Try again"}
        </button>
      </div>
    </div>
  );
}
