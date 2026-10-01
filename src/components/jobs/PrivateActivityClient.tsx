'use client';

import dynamic from 'next/dynamic';

const PrivateActivity = dynamic(
  () => import('@/components/jobs/PrivateActivity').then((module) => module.PrivateActivity),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-xs text-[color:var(--text-faint)]">
        Checking connected wallets…
      </div>
    ),
  },
);

export function PrivateActivityClient({ explorerBase }: { explorerBase: string }) {
  return <PrivateActivity explorerBase={explorerBase} />;
}
