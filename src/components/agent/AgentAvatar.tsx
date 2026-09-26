'use client';

import { useState } from 'react';

/**
 * Publisher-controlled images frequently come from expiring or restrictive
 * hosts. Keep the agent identifiable when the image cannot be loaded instead
 * of leaving a broken or empty frame in the primary heading.
 */
export function AgentAvatar({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A';

  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] sm:size-[72px]">
      {src && !failed ? (
        // Registry images can come from arbitrary publisher-controlled hosts,
        // so they are displayed directly rather than proxied through Pokter.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={72}
          height={72}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="text-sm font-semibold tracking-tight text-[color:var(--text-muted)]"
        >
          {initials}
        </span>
      )}
    </div>
  );
}
