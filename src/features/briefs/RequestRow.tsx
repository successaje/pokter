import Link from 'next/link';

import { requestCategoryLabel, type BriefContent } from '@/lib/briefs/model';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { cn } from '@/lib/ui/cn';
import { AgentAvatar } from '@/ui/Agent';
import { Icon } from '@/ui/icons';

export interface RequestRowData extends Pick<BriefContent, 'title' | 'brief' | 'budgetU' | 'chainId' | 'closesAt' | 'category'> {
  id: string;
  poster: string;
  postedAt: string;
  proposals: number;
  state: 'open' | 'awarded' | 'cancelled';
}

/**
 * One request as the board lists it: who asked, what, how much, and how
 * long it is open — enough to decide whether to open it.
 *
 * The same row is the live preview beside the posting form, so what a
 * poster watches take shape is what builders will scan.
 */
export function RequestRow({ request, now, preview = false }: { request: RequestRowData; now: number; preview?: boolean }) {
  const category = requestCategoryLabel(request.category);
  const closing = request.closesAt ? closesIn(request.closesAt, now) : null;
  const testnet = request.chainId === 97;
  const meta = [
    preview ? 'Posted just now' : `Posted ${ago(request.postedAt, now)}`,
    request.proposals === 1 ? '1 proposal' : `${request.proposals} proposals`,
    request.state === 'awarded' ? 'Agent chosen' : request.state === 'cancelled' ? 'Withdrawn' : closing,
  ].filter(Boolean);

  const body = (
    <>
      <AgentAvatar name="Poster" seed={request.poster.toLowerCase()} size={40} className="mt-0.5 hidden rounded-full @lg:block" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cn('min-w-0 break-words text-[16px] font-semibold tracking-[-0.015em]', !request.title && 'text-ink-3')}>
            {request.title || 'Your title'}
          </span>
          {category && <span className="inline-flex h-6 items-center rounded-full border border-rule-strong px-2.5 text-[12px] font-medium text-ink-2">{category}</span>}
        </span>
        <span className={cn('line-clamp-1 break-words text-[13.5px]', request.brief ? 'text-ink-2' : 'text-ink-3')}>
          {summary(request.brief) || 'What you need, in a sentence.'}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
          {meta.map((part, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>·</span>}
              {part}
            </span>
          ))}
        </span>
      </span>
      <span className="flex shrink-0 flex-row items-baseline justify-between gap-1 border-t border-rule pt-3 @lg:flex-col @lg:items-end @lg:border-0 @lg:pt-0">
        <span className="hidden text-[11.5px] text-ink-3 @lg:block">Proposed budget</span>
        <span className="t-readout text-[19px] text-ink">{request.budgetU > 0 ? formatQuotedPrice(request.budgetU) : '— $U'}</span>
        {/* Test money never sits next to a real-looking number unmarked. */}
        <span className={cn('text-[12px]', testnet ? 'font-medium text-watch' : 'text-ink-3')}>{testnet ? 'Testnet · test tokens' : 'BNB Chain'}</span>
      </span>
    </>
  );

  const shell = 'flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-4 @lg:flex-row @lg:items-start @lg:gap-4 @lg:p-5';
  /* Laid out by the width it is given, not the window's: the same row sits in the board and in the form's narrow side column. */
  if (preview) {
    return (
      <div className="@container">
        <div className={cn(shell, 'shadow-lift')}>{body}</div>
      </div>
    );
  }
  return (
    <div className="@container">
      <Link href={`/requests/${request.id}`} className={cn(shell, 'group transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift')}>
        {body}
        <Icon.Arrow size={15} className="hidden shrink-0 self-center text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink @lg:block" />
      </Link>
    </div>
  );
}

/** The first sentence or line, which is what a scanning reader takes in. */
export function summary(brief: string): string {
  const first = brief.trim().split('\n')[0] ?? '';
  const sentence = /^(.+?[.!?])(\s|$)/.exec(first)?.[1] ?? first;
  return sentence.length > 140 ? `${sentence.slice(0, 139).trimEnd()}…` : sentence;
}

export function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function closesIn(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return 'Proposals closed';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `Closes in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.ceil(hours / 24);
  return `Closes in ${days} ${days === 1 ? 'day' : 'days'}`;
}
