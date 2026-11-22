"use client";

import Link from "next/link";

/**
 * An empty screen that helps: what will appear here, and the one thing to do next.
 * action: a link (href) or a button (onClick). Shown only when given.
 */
export function Empty({
  icon = "i-cal",
  title,
  text,
  action,
  compact,
}: {
  icon?: string;
  title: string;
  text?: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  compact?: boolean;
}) {
  return (
    <div className={`empty2${compact ? " compact" : ""}`}>
      <span className="empty2-ic" aria-hidden="true">
        <svg className="i">
          <use href={`#${icon}`} />
        </svg>
      </span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action &&
        (action.href ? (
          <Link className="btn primary" href={action.href}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn primary" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
