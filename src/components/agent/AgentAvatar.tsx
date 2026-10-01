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
  const [generatedFailed, setGeneratedFailed] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A';
  /*
   * A colour per agent, stable and actually distinguishable.
   *
   * The hue used to span 36–53 degrees — a seventeen-degree band of gold — so
   * every generated avatar came out the same colour and the one thing this
   * image exists to do, tell two unnamed agents apart, it could not do.
   *
   * The hue now runs the whole circle while lightness and chroma stay fixed.
   * That is what oklch buys: unlike hsl, a fixed lightness there is a fixed
   * *perceived* lightness, so a blue avatar is no darker than a yellow one and
   * the near-black initials keep the same contrast against all of them rather
   * than only against the light half of the wheel.
   */
  const seed = [...name].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    2166136261,
  );
  const hue = seed % 360;
  const accentHue = (hue + 28) % 360;
  const generatedSrc = `/api/avatars/${encodeURIComponent(`marketplace-${seed}`)}`;

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
      ) : !generatedFailed ? (
        // The seed is deterministic: an agent keeps the same identity across
        // cards, rankings and visits while no publisher image is available.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={generatedSrc}
          alt=""
          width={72}
          height={72}
          onError={() => setGeneratedFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-label={`${name} generated profile image`}
          role="img"
          className="relative flex size-full items-center justify-center overflow-hidden"
          style={{
            /*
             * Colour and gradient set separately so a browser without oklch
             * drops only the gradient and still shows a solid, readable tile
             * rather than falling back to an empty frame.
             */
            backgroundColor: `hsl(${hue} 70% 68%)`,
            backgroundImage: `linear-gradient(145deg, oklch(0.82 0.13 ${hue}), oklch(0.68 0.16 ${accentHue}))`,
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
