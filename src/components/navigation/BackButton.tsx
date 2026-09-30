'use client';

import { useRouter } from 'next/navigation';

export function BackButton({ fallback = '/discover' }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push(fallback); }} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-xs font-medium transition-colors hover:bg-[color:var(--surface-hover)]">
      <span aria-hidden>←</span> Back
    </button>
  );
}
