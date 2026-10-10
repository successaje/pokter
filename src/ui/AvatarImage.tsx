'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';

export function AvatarImage({ src, fallback, name, size, className }: { src: string | null; fallback: string; name: string; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React attaches onError.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0 && src) img.dispatchEvent(new Event('error'));
  }, [src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={!src || failed ? fallback : src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-[10px] border border-rule bg-sunken object-cover', className)}
      style={{ width: size, height: size }}
      title={name}
    />
  );
}
