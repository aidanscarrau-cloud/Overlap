"use client";

import { useEffect } from "react";
import { isStaleBuild, reloadOnce } from "@/lib/chunk-reload";

/** Quietly reloads the page if it's still running an older version of Overlap after an update. */
export function StaleBuildReload() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => isStaleBuild(String(e.message || e.error?.message || "")) && reloadOnce();
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined;
      if (isStaleBuild(String(typeof r === "string" ? r : (r?.message ?? "")))) reloadOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);
  return null;
}
