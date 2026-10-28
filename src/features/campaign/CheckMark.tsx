import { CHECK_WORDS, type CampaignCheck } from '@/lib/campaign/check-state';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

/*
 * One mark per answer, the same on every campaign surface: a filled tick
 * only for what Pokter verified, a dashed question for what it cannot
 * confirm, and the step's number (or a dash) for what is not met yet.
 */
export function CheckMark({ state, n, className }: { state: CampaignCheck; n?: number; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-medium',
        state === 'verified' && 'bg-ok text-paper',
        state === 'cannot-verify' && 'border border-dashed border-watch text-watch',
        state === 'not-yet' && 'border border-rule-strong text-ink-3',
        className,
      )}
      role="img"
      aria-label={CHECK_WORDS[state]}
    >
      {state === 'verified' ? <Icon.Check size={13} aria-hidden /> : state === 'cannot-verify' ? <span aria-hidden>?</span> : n ? <span aria-hidden>{n}</span> : <Icon.Dash size={12} aria-hidden />}
    </span>
  );
}

export function CheckWords({ state }: { state: CampaignCheck }) {
  return (
    <span className={cn('text-[11.5px] font-medium', state === 'verified' ? 'text-ok' : state === 'cannot-verify' ? 'text-watch' : 'text-ink-3')}>
      {CHECK_WORDS[state]}
    </span>
  );
}
