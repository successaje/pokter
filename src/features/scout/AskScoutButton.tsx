'use client';

import { cn } from '@/lib/ui/cn';

import { openScout } from './open';
import { ScoutFigure } from './ScoutFigure';

/**
 * "Ask Scout about this agent", beside what the agent says about itself.
 *
 * Placed under the summary because that is where a newcomer stops: the
 * builder's own words, then a page of evidence in Pokter's vocabulary.
 * Scout reads that evidence back in plain words. It explains only what
 * Pokter already holds, so asking never contacts the agent.
 */
export function AskScoutButton({ chainId, tokenId, name, className }: { chainId: 56 | 97; tokenId: string; name: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openScout({ about: { chainId, tokenId, name }, ask: `Explain ${name} in simple terms: what it does, what Pokter’s checks show, and what hiring it would involve.` })}
      className={cn(
        'group inline-flex h-9 items-center gap-2 rounded-full border border-rule-strong bg-raised pl-2.5 pr-3.5 text-[13.5px] font-medium text-ink transition-colors hover:border-ink',
        className,
      )}
    >
      <ScoutFigure size={30} near={240} />
      Ask Scout about this agent
    </button>
  );
}
