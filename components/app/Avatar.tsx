"use client";

import { useApp } from "./AppProvider";
import { initials } from "@/lib/format";

/** A person's profile picture, or their initials if they haven't added one. */
export function Avatar({ userId, name, className = "av", style }: { userId?: string | null; name: string; className?: string; style?: React.CSSProperties }) {
  const { data } = useApp();
  const url = userId ? data.avatars?.[userId] : undefined;
  if (url)
    return (
      <span className={`${className} has-img`} style={style} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" />
      </span>
    );
  return (
    <span className={className} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
