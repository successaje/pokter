import Link from 'next/link';

import type { FindRow } from '@/lib/find/rows';
import { chainLabel, escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { AgentAvatar, ProbeStrip, answerState } from '@/ui/Agent';
import { Icon } from '@/ui/icons';
import { VerdictLabel } from '@/ui/Verdict';
import { MaturityLabel } from '@/ui/Maturity';
import { LinkButton } from '@/ui/Button';
import { isHouseAgent } from '@/lib/house/wallets';

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
  /*
   * Two different facts, said differently. "No signed price" covered both
   * an agent nothing has reached and one that answers every check but
   * whose price Pokter cannot accept — and the second is the owner's bug,
   * not the agent's silence. The exact refusal is named on the agent's own
   * page, which is the only surface that reads the sweep's failure code.
   */
  return (
    <span className={cn('text-[13px] text-ink-3', className)}>
      {row.priceState === 'unverified' ? 'No price Pokter could verify' : 'No price available'}
    </span>
  );
}

/**
 * Where the identity lives, which is not where a hire settles.
 *
 * The card showed only the hiring network, and when there was no verified
 * price that was filled in with a testnet default — so a mainnet agent
 * read as a testnet one and the registration was nowhere on the card to
 * contradict it. Both facts now appear, and neither stands in for the
 * other.
 */
export function RegisteredNetwork({ chainId, className }: { chainId: number; className?: string }) {
  return (
    <span className={cn('text-[11.5px] text-ink-3', className)}>
      Registered on {chainLabel(chainId)}
    </span>
  );
}

/**
 * The money lines under a price: what a paid hire settles in, or the free
 * trial when that is all there is, and the network the identity is
 * registered on.
 *
 * One component because there are three card layouts, and the first
 * version of this change updated one of them — so two kept calling
 * `HireNetwork` straight and lost both the trial line and the
 * registration. Written once, they cannot disagree.
 */
export function HiringLines({ row, align }: { row: FindRow; align?: 'end' }) {
  return (
    <>
      {row.hireChainId !== null
        ? <HireNetwork chainId={row.hireChainId} />
        : row.hirable ? <TrialNote /> : null}
      <RegisteredNetwork chainId={row.chainId} className={align === 'end' ? 'text-right' : undefined} />
    </>
  );
}

/**
 * The free testnet trial, named as a trial.
 *
 * Offered for an agent with no payable price, and it is not the agent
 * taking the job: Pokter's own delivery agent carries the task and returns
 * the answer. Saying so matters more than the label — a trial is not
 * evidence the listed provider accepted or delivered anything, and the
 * evidence ladder already refuses to count it (`maturity.ts`, and the
 * delivery paths refuse any job that does not name them as provider).
 */
export function TrialNote({ className }: { className?: string }) {
  return (
    <span className={cn('text-[11.5px] text-watch', className)} title="Pokter’s delivery agent carries the task to the agent and returns its answer. It does not count as a delivery by the agent.">
      Free testnet trial · carried by Pokter’s delivery agent
    </span>
  );
}

/**
 * The standard marketplace card. Hierarchy, top to bottom: who and where it
 * is registered, what it does, the evidence (does it answer, has it
 * delivered), what it costs and in which money, then one clear action.
 * No ratings, no popularity, no badges that measure nothing.
 */
export function AgentCard({ row, className, note, compare }: { row: FindRow; className?: string; note?: string | null; compare?: React.ReactNode }) {
  const status = availabilityText(row);
  return (
    <article className={cn('group relative flex h-full flex-col rounded-[16px] border border-rule bg-raised p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-lift', className)}>
      <div className="flex items-start gap-3.5">
        {/* No ring. It was a circle drawn around a rounded square, which
            left four corners reaching for it, and the answer dot then had
            to sit on the ring itself. The dot is the accent now, and the
            three card variants finally draw the avatar the same way. */}
        <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={48} status={answerState(row)} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-[16px] font-semibold tracking-[-0.015em]">
            <Link href={agentHref(row)} className="after:absolute after:inset-0 after:rounded-[16px] focus-visible:outline-none">
              {row.name}
            </Link>
          </h3>
          {/*
            The registration is said once, in the money block below, where
            it sits beside the network a hire actually settles on — which
            is the comparison it exists to make. A bordered chip up here
            said the same thing a second time on every card in the
            catalogue, in the loudest treatment on it, competing with the
            name for a fact that is not why anyone is reading.
          */}
          <span className="truncate text-[12.5px] text-ink-3">
            {row.categoryLabel} <span className="t-readout">#{row.tokenId}</span>{isHouseAgent({ owner_address: row.owner }) ? ' · Run by Pokter' : ''}
          </span>
        </div>
      </div>

      <p className="mt-3.5 line-clamp-2 min-h-[2.9em] text-[13.5px] leading-[1.45] text-ink-2">{row.description || 'No description published.'}</p>

      {/* The evidence, as two facts a buyer can check: does it answer, and has it delivered paid work. */}
      <dl className="mt-4 flex flex-col rounded-[12px] border border-rule bg-sunken/40 text-[12.5px]">
        <div className="flex flex-col gap-1 px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <span className={cn('size-1.5 shrink-0 rounded-full', DOT[status.tone])} aria-hidden />
            {/* Same shape as the row below: shrink-0 label, value pushed right. */}
            <dt className="shrink-0 text-ink-2">Probe replies</dt>
            <dd className="ml-auto flex min-w-0 shrink-0 items-center gap-2.5" title={row.probes ? `${row.probes} probes in total` : undefined}>
              <span className="t-readout text-ink">{row.rate === null ? '—' : `${Math.round(row.rate * 100)}%`}</span>
              {row.probes > 0 && <ProbeStrip cells={row.cells} className="h-4 [&>span]:w-[3px]" />}
            </dd>
          </div>
          {/* Not answering right now is said in words, not left to the colour of a dot. */}
          {status.tone !== 'ok' && <p className="pl-[18px] text-[11.5px] text-ink-3">{status.text}</p>}
        </div>
        {/*
          Wrapping, not nowrap. The label was `min-w-0 flex-1
          whitespace-nowrap`, so it shrank below its own text and ran
          straight over the chip beside it: "Delivery evidenNot answering
          yet". A chip's width is the agent's, not ours, so the row has to
          survive a long one rather than assume a short one.
        */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-rule px-3.5 py-2.5">
          <span className={cn('size-1.5 shrink-0 rounded-full', row.paid.missed ? DOT.watch : row.paid.delivered ? DOT.ok : DOT.none)} aria-hidden />
          <dt className="shrink-0 text-ink-2">Delivery evidence</dt>
          <dd className="ml-auto min-w-0">
            {row.paid.missed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-watch/35 bg-watch-wash px-2.5 py-1 text-[12px] font-medium text-watch" title="Funded through Pokter escrow, nothing delivered before the deadline">
                <span className="size-1.5 rounded-full bg-watch" aria-hidden />
                {row.paid.missed} of {row.paid.delivered + row.paid.missed} paid job{row.paid.delivered + row.paid.missed === 1 ? '' : 's'} missed
              </span>
            ) : (
              <MaturityLabel maturity={row.maturity} concise />
            )}
          </dd>
        </div>
      </dl>

      {note && (
        <p className="mt-3 flex items-center gap-2 rounded-[10px] border border-rule px-3 py-2 text-[12px] text-ink-3" title={note}>
          <Icon.Info size={13} className="shrink-0" />
          <span className="truncate">{note}</span>
        </p>
      )}

      {/* Price, then where it settles, then where the identity lives: the
          three facts in the order a buyer needs them. */}
      <div className="mt-auto flex flex-col pt-5">
        {row.priceU !== null ? <PriceText row={row} className="text-[1.6rem] font-medium leading-none tracking-[-0.02em]" /> : <PriceText row={row} />}
        <span className="mt-1.5 flex flex-col gap-0.5">
          <HiringLines row={row} />
        </span>
      </div>

      <div className="relative z-10 mt-4">
        <NextStep row={row} wide />
      </div>

      <div className="relative z-10 mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3">
        <Link href={`${agentHref(row)}#evidence`} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">
          View evidence <Icon.ArrowUpRight size={13} />
        </Link>
        {compare}
      </div>
    </article>
  );
}

/** Which network the main action hires on, said on the button. */
function hireLabel(row: FindRow): string {
  if (row.hireChainId === 56) return 'Hire on BNB Chain';
  if (row.hireChainId === 97) return 'Hire on testnet';
  return 'Try free on testnet';
}

/** Hire when the agent can be hired here; otherwise a way to read why not. */
function NextStep({ row, size = 's', wide = false }: { row: FindRow; size?: 's'; wide?: boolean }) {
  if (wide) {
    return row.hirable ? (
      <LinkButton href={`/hire/${row.chainId}/${row.tokenId}`} className="w-full" trailing={<Icon.Arrow size={15} />}>
        {hireLabel(row)}
      </LinkButton>
    ) : (
      <LinkButton href={agentHref(row)} intent="secondary" className="w-full">
        Why it cannot be hired yet
      </LinkButton>
    );
  }
  if (row.hirable) {
    return (
      <LinkButton href={`/hire/${row.chainId}/${row.tokenId}`} size={size} className="relative z-10 shrink-0" trailing={<Icon.Arrow size={14} />}>
        Hire
      </LinkButton>
    );
  }
  return (
    <Link href={agentHref(row)} className="relative z-10 shrink-0 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline">
      View agent
    </Link>
  );
}

/** The dense row for list view and search results. */
export function AgentRow({ row, reason, trailing }: { row: FindRow; reason?: string; trailing?: React.ReactNode }) {
  const status = availabilityText(row);
  return (
    <article className="group relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-2 py-4 sm:grid-cols-[44px_minmax(0,1fr)_150px_120px_110px] sm:items-center">
      <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={44} status={answerState(row)} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Link href={agentHref(row)} className="truncate after:absolute after:inset-0 hover:underline focus-visible:outline-none">
            {row.name}
          </Link>
          {row.hirable && <span className="shrink-0 rounded-[5px] bg-signal-wash px-1.5 py-px text-[11px] font-medium text-ink">Hireable</span>}
        </h3>
        <p className="truncate text-[13px] text-ink-2">{row.description || 'No description published.'}</p>
        <span className="mt-1"><MaturityLabel maturity={row.maturity} concise /></span>
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
          <HiringLines row={row} align="end" />
          {row.hirable && (
            <Link href={`/hire/${row.chainId}/${row.tokenId}`} className="relative z-10 mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline">
              Hire <Icon.Arrow size={12} />
            </Link>
          )}
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
        <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={48} status={answerState(row)} />
        <span className="t-label">{row.categoryLabel}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold tracking-[-0.015em]">
          <Link href={agentHref(row)} className="after:absolute after:inset-0 after:rounded-[16px] focus-visible:outline-none">
            {row.name}
          </Link>
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-ink-2">{row.description}</p>
        <span className="pt-1"><MaturityLabel maturity={row.maturity} concise /></span>
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
            <HiringLines row={row} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="t-label">Availability</dt>
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
