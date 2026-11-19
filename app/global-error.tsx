"use client";

import { useEffect } from "react";
import { isStaleBuild, reloadOnce } from "@/lib/chunk-reload";

// Last-resort screen if the whole app fails to load. After an update it just reloads.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const stale = isStaleBuild(error?.message ?? "");
  useEffect(() => {
    if (stale) reloadOnce();
  }, [stale]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>{stale ? "Updating Overlap…" : "Something went wrong"}</h1>
          <p style={{ color: "#555f6d", margin: "0 0 18px" }}>{stale ? "A new version is ready. One moment." : "Please reload the page."}</p>
          <button onClick={() => window.location.reload()} style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#17181c", color: "#fff", fontWeight: 600, fontSize: 15 }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
