'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/ui/cn';

type WorkspaceMode = 'personal' | 'builder';

function ModeIcon({ mode }: { mode: WorkspaceMode }) {
  const common = 'size-4 fill-none stroke-current';
  if (mode === 'builder') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5v-9Z" />
        <path d="m4 8.5 8 4.5 8-4.5M12 13v9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" />
    </svg>
  );
}

/**
 * The two product contexts are visible where work happens, not hidden behind
 * the wallet menu. Builder access is still server-authorised: this control
 * only reveals the route after the existing signed session says it may.
 */
export function WorkspaceModeSwitch({
  current,
  builderOwner,
}: {
  current: WorkspaceMode;
  builderOwner?: string;
}) {
  const session = useQuery<{ authenticated: boolean; owner?: string }>({
    queryKey: ['builder-session'],
    queryFn: async () => {
      const response = await fetch('/api/builders/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Builder session could not be read.');
      return response.json() as Promise<{ authenticated: boolean; owner?: string }>;
    },
    enabled: !builderOwner,
    staleTime: 30_000,
  });
  const verifiedBuilder = builderOwner ?? (session.data?.authenticated ? session.data.owner : undefined);
  const builderHref = verifiedBuilder ? '/builder' : '/build';

  return (
    <nav
      aria-label="Workspace mode"
      className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-1"
    >
      <Link
        href="/app"
        aria-current={current === 'personal' ? 'page' : undefined}
        className={cn(
          'flex min-h-9 items-center gap-2 rounded-[var(--radius)] px-3 text-[12px] font-medium transition-colors',
          current === 'personal'
            ? 'bg-[color:var(--surface-raised)] text-[color:var(--text)] shadow-sm'
            : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
        )}
      >
        <ModeIcon mode="personal" />
        Personal
      </Link>
      <Link
        href={builderHref}
        aria-current={current === 'builder' ? 'page' : undefined}
        className={cn(
          'flex min-h-9 items-center gap-2 rounded-[var(--radius)] px-3 text-[12px] font-medium transition-colors',
          current === 'builder'
            ? 'bg-[color:var(--surface-raised)] text-[color:var(--text)] shadow-sm'
            : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
        )}
      >
        <ModeIcon mode="builder" />
        {verifiedBuilder || session.isPending ? 'Builder' : 'Set up builder'}
      </Link>
    </nav>
  );
}
