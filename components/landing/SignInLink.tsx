"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** "Sign in" for visitors; "Open my club" for people already signed in on this device. */
export function SignInLink({ className }: { className?: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const has = document.cookie.split("; ").some((c) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(c));
    setSignedIn(has);
    // The installed phone app opens at the club, not the front page (older installs started at "/").
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (has && standalone) window.location.replace("/home");
  }, []);
  return (
    <Link href={signedIn ? "/home" : "/login"} className={className}>
      {signedIn ? "Open my club" : "Sign in"}
    </Link>
  );
}
