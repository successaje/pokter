'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readSavedAgents, subscribeToSavedAgents } from '@/lib/wallet/saved-agents';

export function SavedNavAction() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => setCount(readSavedAgents().length);
    refresh();
    return subscribeToSavedAgents(refresh);
  }, []);
  return (
    <Link href="/saved" aria-label={`Saved agents${count ? `, ${count}` : ''}`} className="relative hidden size-9 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)] sm:flex">
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8"><path d="M12 20.5 4.8 13.8A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 7.2 7.5L12 20.5Z" /></svg>
      {count > 0 && <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[color:var(--brand)] px-1 text-[9px] font-bold leading-4 text-[color:var(--brand-ink)]">{count > 9 ? '9+' : count}</span>}
    </Link>
  );
}
