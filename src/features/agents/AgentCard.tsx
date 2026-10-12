import Link from 'next/link';

import type { FindRow } from '@/lib/find/rows';
import { escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { Icon } from '@/ui/icons';
import { VerdictLabel } from '@/ui/Verdict';

/** Paid jobs the agent let lapse, said only when there are some. */
function MissedNote({ row, className }: { row: FindRow; className?: string }) {
  if (!row.paid.missed) return null;
  return (
    <span className={cn('flex items-center gap-2 text-[12.5px] text-ink-2', className)} title="Funded through Pokter escrow, nothing delivered before the deadline">
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT.watch)} aria-hidden />
      Missed {row.paid.missed} of {row.paid.delivered + row.paid.missed} paid job{row.paid.delivered + row.paid.missed === 1 ? '' : 's'}
    </span>
  );
}

export function agentHref(row: Pick<FindRow, 'chainId' | 'tokenId'>) {
  return `/agents/${row.chainId}/${row.tokenId}`;
}

export function availabilityText(row: FindRow): { text: string; tone: 'ok' | 'watch' | 'bad' | 'none' } {
  if (row.probes === 0) return { text: 'Not probed yet', tone: 'none' };
  if (row.rate === 0) return { text: 'Has never answered', tone: 'bad' };
  if (row.answeringToday) return { text: `Answering · ${Math.round((row.rate ?? 0) * 100)}% replied`, tone: (row.rate ?? 0) >= 0.9 ? 'ok' : 'watch' };
  if (row.sinceAnswer !== null) return { text: `Last answered ${row.sinceAnswer === 0 ? 'today' : `${row.sinceAnswer}d ago`}`, tone: 'watch' };
  return { text: `${Math.round((row.rate ?? 0) * 100)}% replied`, tone: 'watch' };
}

const DOT = { ok: 'bg-ok', watch: 'bg-watch', bad: 'bg-bad', none: 'bg-rule-strong' } as const;

/**
 * Which money the price is in, on the card.
 *
 * The catalogue showed "0.10 $U" with nothing saying whether that is a
 * cost or faucet currency, and the network filter beside it is headed
 * "Registered on" — the registry chain, which for most of this
 * catalogue is not the chain a hire settles on. Filtering to BNB Chain
 * and then reading testnet prices looks like a broken filter when it is
 * really two different facts wearing one word.
 */
export function HireNetwork({ chainId, className }: { chainId: number | null; className?: string }) {
  if (chainId === null) return null;
  const money = escrowMoney(chainId);
  if (money.real === null) return null;
  return (
    <span className={cn('text-[11.5px] font-medium', money.real ? 'text-ink-3' : 'text-watch', className)}>
      {money.real ? 'Real funds · BNB Chain' : 'Test tokens · BNB Testnet'}
    </span>
  );
}

export function PriceText({ row, className }: { row: FindRow; className?: string }) {
  if (row.priceU !== null) {
    return (
      <span className={cn('t-readout text-ink', className)} title="Signed by the agent's registered wallet">
        {row.priceLabel}
      </span>
    );
  }
  return <span className={cn('text-[13px] text-ink-3', className)}>No signed price</span>;
}

/**
 * The standard marketplace card. Hierarchy, top to bottom: who, what it
 * does, whether it is answering, what the evidence says, what it costs,
 * what to do. No ratings, no popularity, no badges that measure nothing.
 */
export function AgentCard({ row, className, action }: { row: FindRow; className?: string; action?: React.ReactNode }) {
  const status = availabilityText(row);
  return (
    <article className={cn('group relative flex h-full flex-col rounded-[14px] border border-rule bg-raised p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-lift', className)}>
      <div className="flex items-start gap-3">
        <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={44} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">
            <Link href={agentHref(row)} className="after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none">
              {row.name}
            </Link>
          </h3>
          <span className="text-[12.5px] text-ink-3">
            {row.categoryLabel} · #{row.tokenId}
          </span>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.8em] text-[13.5px] leading-[1.45] text-ink-2">{row.description || 'No description published.'}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2" title={row.probes ? `${row.probes} probes in total` : undefined}>
          <span className={cn('size-1.5 shrink-0 rounded-full', DOT[status.tone])} aria-hidden />
          <span className="truncate">{status.text}</span>
        </span>
        {row.probes > 0 && <ProbeStrip cells={row.cells} className="h-4 shrink-0 [&>span]:w-[3px]" />}
      </div>
      <MissedNote row={row} className="mt-1.5" />

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-rule pt-3.5">
        <VerdictLabel verdict={row.verdict} />
        <span className="flex flex-col items-end gap-0.5">
          <PriceText row={row} className="text-[13px]" />
          <HireNetwork chainId={row.hireChainId} />
        </span>
      </div>
      {action && <div className="relative z-10 mt-3">{action}</div>}
    </article>
  );
}

/** The dense row for list view and search results. */
export function AgentRow({ row, reason, trailing }: { row: FindRow; reason?: string; trailing?: React.ReactNode }) {
  const status = availabilityText(row);
  return (
    <article className="group relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-2 py-4 sm:grid-cols-[44px_minmax(0,1fr)_150px_120px_110px] sm:items-center">
      <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={44} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Link href={agentHref(row)} className="truncate after:absolute after:inset-0 hover:underline focus-visible:outline-none">
            {row.name}
          </Link>
          {row.hirable && <span className="shrink-0 rounded-[5px] bg-signal-wash px-1.5 py-px text-[11px] font-medium text-ink">Hireable</span>}
        </h3>
        <p className="truncate text-[13px] text-ink-2">{row.description || 'No description published.'}</p>
        {reason && (
          <p className="text-[12px] text-ink-3">
            <span className="text-ink-2">Why it matches:</span> {reason}
          </p>
        )}
      </div>
      <span className="col-start-2 flex flex-col gap-1 sm:col-start-auto">
        <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className={cn('size-1.5 shrink-0 rounded-full', DOT[status.tone])} aria-hidden />
          <span className="truncate">{status.text}</span>
        </span>
        <MissedNote row={row} />
      </span>
      <span className="col-start-2 sm:col-start-auto">
        <VerdictLabel verdict={row.verdict} />
      </span>
      <span className="col-start-2 flex items-center justify-between gap-2 sm:col-start-auto sm:justify-end">
        <span className="flex flex-col sm:items-end">
          <PriceText row={row} className="text-[13px]" />
          <HireNetwork chainId={row.hireChainId} />
        </span>
        {trailing}
      </span>
    </article>
  );
}

/** A larger, quieter card for curated placements on the home page. */
export function FeaturedAgent({ row }: { row: FindRow }) {
  const status = availabilityText(row);
  return (
    <article className="group relative flex h-full flex-col gap-4 rounded-[16px] border border-rule bg-raised p-6 transition-[border-color,box-shadow] duration-200 hover:border-rule-strong hover:shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={48} />
        <span className="t-label">{row.categoryLabel}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold tracking-[-0.015em]">
          <Link href={agentHref(row)} className="after:absolute after:inset-0 after:rounded-[16px] focus-visible:outline-none">
            {row.name}
          </Link>
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-ink-2">{row.description}</p>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-rule pt-4 text-[12.5px]">
        <div className="flex flex-col gap-0.5">
          <dt className="t-label">Status</dt>
          <dd className="flex items-center gap-1.5 text-ink-2">
            <span className={cn('size-1.5 rounded-full', DOT[status.tone])} aria-hidden />
            {status.tone === 'ok' ? 'Answering' : status.text}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="t-label">Price</dt>
          <dd className="flex flex-col gap-0.5">
            <PriceText row={row} />
            <HireNetwork chainId={row.hireChainId} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="t-label">Evidence</dt>
          <dd>
            <VerdictLabel verdict={row.verdict} className="text-[12.5px]" />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="t-label">Paid jobs</dt>
          <dd className="t-readout text-ink-2">{row.paid.jobs === 0 ? 'None yet' : `${row.paid.delivered} delivered${row.paid.missed ? ` · ${row.paid.missed} missed` : ''}`}</dd>
        </div>
      </dl>
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink">
        View agent <Icon.Arrow size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </article>
  );
}
