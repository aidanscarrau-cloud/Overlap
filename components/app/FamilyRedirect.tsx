"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";

/** Pages players and parents don't need (squad, drill library) send them home instead. */
export function useFamilyRedirect() {
  const { data } = useApp();
  const router = useRouter();
  const family = data.role === "player" || data.role === "parent";
  useEffect(() => {
    if (family) router.replace("/home");
  }, [family, router]);
  return family;
}
