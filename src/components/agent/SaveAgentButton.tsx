'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/ui/cn';
import { isAgentSaved, subscribeToSavedAgents, toggleSavedAgent } from '@/lib/wallet/saved-agents';

export function SaveAgentButton({
  agent,
  compact = false,
  className,
}: {
  agent: { chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string; description: string };
  compact?: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => setSaved(isAgentSaved(agent.chainId, agent.tokenId));
    refresh();
    return subscribeToSavedAgents(refresh);
  }, [agent.chainId, agent.tokenId]);

  return (
    <button
      type="button"
      aria-label={saved ? `Remove ${agent.name} from saved agents` : `Save ${agent.name}`}
      aria-pressed={saved}
      title={saved ? 'Remove from saved' : 'Save agent'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setSaved(toggleSavedAgent(agent));
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-full border transition-colors',
        compact ? 'size-8' : 'gap-2 px-3 py-2 text-[12px] font-medium',
        saved
          ? 'border-[color:var(--brand)]/45 bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]'
          : 'border-[color:var(--border-strong)] bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={cn('size-4 stroke-current', saved ? 'fill-current' : 'fill-none')} strokeWidth="1.8">
        <path d="M12 20.5 4.8 13.8A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 7.2 7.5L12 20.5Z" />
      </svg>
      {!compact && (saved ? 'Saved' : 'Save agent')}
    </button>
  );
}
