'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BuilderSignOutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await fetch('/api/builders/session', { method: 'DELETE' }); }
    finally { router.replace('/build'); router.refresh(); }
  }} className="text-[12px] text-[color:var(--text-muted)] underline decoration-dotted disabled:opacity-50">{busy ? 'Signing out…' : 'Sign out'}</button>;
}
