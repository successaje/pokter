'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * A published picture, with the generated mark behind it.
 *
 * The fallback used to be a swap in `onError`, which only happens once
 * the page has hydrated. Until then, and for good if it never does, a
 * failed picture drew the browser's broken-image glyph: on the catalogue
 * that was two cards in three, because most publisher images 404. The
 * mark is now the frame's own background, so a picture that fails to load
 * leaves it showing with no script involved. The `title` sits on the
 * frame too: on the `<img>` it is what makes the browser draw the glyph
 * for an image whose `alt` is empty.
 *
 * Once hydrated, a picture that loads takes the plain ground back, so a
 * transparent one is not drawn over somebody else's rings, and one that
 * fails is swapped for the mark as before.
 */
export function AvatarImage({ src, fallback, name, size, className, eager }: { src: string | null; fallback: string; name: string; size: number; className?: string; eager?: boolean }) {
  // Keyed to the source, so a new picture (the profile editor's draft) starts over.
  const [settled, setSettled] = useState<{ src: string | null; state: 'loaded' | 'failed' } | null>(null);
  const state = settled?.src === src ? settled.state : 'pending';
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered image can settle before React attaches its handlers.
  useEffect(() => {
    const img = ref.current;
    if (!img || !src || !img.complete) return;
    img.dispatchEvent(new Event(img.naturalWidth === 0 ? 'error' : 'load'));
  }, [src]);
  const showing = !src || state === 'failed' ? fallback : src;
  return (
    <span
      className={cn('block shrink-0 overflow-hidden rounded-[10px] border border-rule bg-sunken bg-cover bg-center', className)}
      style={{ width: size, height: size, backgroundImage: showing === src && state !== 'loaded' ? `url("${fallback}")` : undefined }}
      title={name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={showing}
        alt=""
        width={size}
        height={size}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setSettled((s) => (s?.src === src && s.state === 'failed' ? s : { src, state: 'loaded' }))}
        onError={() => setSettled({ src, state: 'failed' })}
        className="size-full object-cover"
      />
    </span>
  );
}
