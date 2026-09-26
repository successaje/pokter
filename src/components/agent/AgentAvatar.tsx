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
  size = 'lg',
}: {
  name: string;
  src: string | null;
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A';
  const seed = [...name].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    2166136261,
  );
  const hue = 36 + (seed % 18);
  const accentHue = 44 + ((seed >>> 8) % 16);

  return (
    <div
      className={
        size === 'sm'
          ? 'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)]'
          : 'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] sm:size-[72px]'
      }
    >
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
          aria-label={`${name} generated profile image`}
          role="img"
          className="relative flex size-full items-center justify-center overflow-hidden"
          style={{
            background: `linear-gradient(145deg, hsl(${hue} 88% 58%), hsl(${accentHue} 92% 43%))`,
          }}
        >
          <span
            aria-hidden
            className="absolute -right-1 -top-1 size-1/2 rounded-full border border-black/10 bg-white/25"
          />
          <span
            aria-hidden
            className="absolute -bottom-1 -left-1 size-2/3 rounded-full border border-white/15 bg-black/10"
          />
          <span
            aria-hidden
            className={
              size === 'sm'
                ? 'relative text-[11px] font-bold tracking-tight text-[#18140a]'
                : 'relative text-sm font-bold tracking-tight text-[#18140a]'
            }
          >
            {initials}
          </span>
        </span>
      )}
    </div>
  );
}
