import Link from 'next/link';

import type { FindRow } from '@/lib/find/rows';
import { chainLabel, escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { formatDelivery } from '@/lib/ui/format';
import { AgentAvatar, answerState } from '@/ui/Agent';
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

/**
 * What the agent does on chain, in two words: whether its own wallet was
 * seen doing its job, says it does and shows none of it, or only advises.
 * The sentence it is drawn from is the tooltip and the agent page's line.
 */
export function OnChainTag({ row, className }: { row: Pick<FindRow, 'onChain'>; className?: string }) {
  const c = row.onChain;
  if (!c) return null;
  const label = c.kind === 'acts' ? 'Acts on chain' : c.kind === 'claims' ? 'Says it acts · none seen' : 'Advises';
  return (
    <span
      title={c.text}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11.5px] font-medium',
        c.kind === 'acts' ? 'bg-ok-wash text-ok' : c.kind === 'claims' ? 'bg-watch-wash text-watch' : 'text-ink-3',
        className,
      )}
    >
      {c.kind === 'acts' && <Icon.Check size={11} aria-hidden />}
      {label}
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

function cardProof(row: FindRow): { label: string; detail: string } {
  const proven = row.maturity.steps.find((step) => step.id === 'proven-in-use');
  if (proven?.earned) return { label: 'Buyer-proven', detail: proven.detail };
  if (row.paid.outsideCompleted > 0) {
    return {
      label: `${row.paid.outsideCompleted} outside`,
      detail: `${row.paid.outsideCompleted} settled paid ${row.paid.outsideCompleted === 1 ? 'job was' : 'jobs were'} funded outside Pokter’s team.`,
    };
  }
  const checked = row.maturity.steps.find((step) => step.id === 'checked');
  if (checked?.earned) return { label: 'Checked', detail: checked.detail };
  /*
   * "No proof yet", not "Not checked": an agent can have been checked and
   * failed (Mandate Guard-1 scored 0 / 3), and "Not checked" said the check
   * never happened. This is true either way; the profile says which.
   */
  return { label: 'No proof yet', detail: 'No passing correctness check or settled outside-buyer delivery on record.' };
}

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
  /* A dash, in the same readout the price would be in, so every card's
     money line sits on the same baseline at the same height. The sentence
     it replaces is still here, on hover: two sentences of small grey text
     in the loudest position on the card was the price's own slot being
     spent on the absence of one. */
  return (
    <span
      className={cn('t-readout text-ink-3', className)}
      title={row.priceState === 'unverified' ? 'This agent answers Pokter\u2019s checks, but no price it returned could be verified. Its page names the exact refusal.' : 'Nothing has reached this agent, so it has never named a price.'}
    >
      {'\u2014'}
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
    /* Short enough not to wrap. At 11.5px on a 376px card the full
       sentence took two lines and pushed the button out of line with the
       card beside it; it is the title now, which is where the detail was
       already duplicated. */
    <span className={cn('whitespace-nowrap text-[11.5px] text-watch', className)} title="Pokter’s delivery agent carries the task to the agent and returns its answer. It does not count as a delivery by the agent.">
      Free testnet trial
    </span>
  );
}

/**
 * The small card: a picture, a name, what it does and what it costs.
 *
 * The same shape the agent page uses for "also measured in", with the price
 * added, because a list somebody is browsing rather than comparing still has
 * to answer "how much" — it is the one fact that decides whether to read
 * the rest, and leaving it off made those lists decorative.
 *
 * Deliberately not a shrunken `AgentCard`: no replies, no paid jobs, no
 * delivery time. Those are for choosing between agents, and this is for
 * noticing one.
 */
export function MiniAgentCard({ row }: { row: FindRow }) {
  return (
    <Link
      href={agentHref(row)}
      className="group flex h-full items-start gap-3 rounded-[12px] border border-rule bg-raised p-3.5 transition-colors hover:border-rule-strong"
    >
      <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={36} status={answerState(row)} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-medium">{row.name}</span>
        <span className="line-clamp-1 text-[12.5px] text-ink-3">{row.description || 'No description published.'}</span>
      </span>
      <PriceText row={row} className="shrink-0 text-[13px]" />
    </Link>
  );
}

/**
 * The standard marketplace card. Hierarchy, top to bottom: who and where it
 * is registered, what it does, the evidence (does it answer, has it
 * delivered), what it costs and in which money, then one clear action.
 * No ratings, no popularity, no badges that measure nothing.
 */
export function AgentCard({
  row,
  className,
  note,
  compare,
  deliveryMs,
}: {
  row: FindRow;
  className?: string;
  note?: string | null;
  compare?: React.ReactNode;
  /**
   * Median time from funding to submission, when the caller has read it.
   * Optional because reading it costs a chain call per job: a surface that
   * has not paid for it says how many deliveries there were and stops,
   * rather than printing a time it has not measured.
   */
  deliveryMs?: number | null;
}) {
  const availability = availabilityText(row);
  const proof = cardProof(row);
  const terminalJobs = row.paid.completed + row.paid.missed;
  return (
    <article className={cn('group relative flex h-full flex-col rounded-[12px] border border-rule bg-raised p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-lift sm:rounded-[16px]', className)}>
      <div className="flex items-start gap-3.5">
        {/* No ring. It was a circle drawn around a rounded square, which
            left four corners reaching for it, and the answer dot then had
            to sit on the ring itself. The dot is the accent now, and the
            three card variants finally draw the avatar the same way. */}
        <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={48} status={answerState(row)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
          {/* Wraps rather than clips. On one line, a 390px card cut the
              category to "Grid Tra…" and the token ID to "#302…" whenever
              the on-chain tag was there too, and a truncated ID is not an
              ID anybody can look up. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-3">
            <span className="max-w-full truncate rounded-full border border-rule bg-sunken px-2 py-0.5 text-ink-2">{row.categoryLabel}</span>
            <OnChainTag row={row} />
            <span className="t-readout shrink-0">#{row.tokenId}</span>{isHouseAgent({ owner_address: row.owner }) ? <span className="shrink-0">· Run by Pokter</span> : null}
          </span>
        </div>
        {/* The footer that used to hold this went with "View evidence";
            the card itself has always linked to the agent page. */}
        {compare && <span className="relative z-10 shrink-0">{compare}</span>}
      </div>

      {/* The reserved height is for cards side by side, where it keeps
          every availability line in a row level. On a phone there is one
          card a row and nothing to line up with, and reserving three lines
          left a short description with a blank one under it. */}
      <p className="mt-3.5 line-clamp-3 text-[13.5px] leading-[1.45] text-ink-2 sm:line-clamp-2 sm:min-h-[2.9em]">{row.description || 'No description published.'}</p>

      <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-2" title={row.probes ? `${row.probes} probes in total` : 'Pokter has never called this agent'}>
        <span className={cn('size-1.5 shrink-0 rounded-full', DOT[availability.tone])} aria-hidden />
        {availability.text}
      </p>

      {/*
        The evidence as three readings, not a panel.

        It was a bordered, filled box holding a status dot, a percentage, a
        14-day sparkline, a second dot, a label and a chip — six treatments
        for three facts, and by some way the heaviest thing on the card.
        The facts have not changed; they are just read off now.

        Recency left with the box and needed no replacement. "Last answered
        5d ago" was the only reason the first dot was there, and the answer
        dot on the avatar now carries it on every card, in one glyph.
      */}
      <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div className="hidden min-w-0 flex-col gap-1.5 sm:flex">
          {/* "Replies", not "Answers": one of the maturity badges in the
              third column is the word "Answers", and a column headed
              Answers showing Answers two columns over reads as an error. */}
          <dt className="t-label">Paid result</dt>
          <dd
            className={cn('t-readout truncate', row.paid.missed ? 'text-watch' : undefined)}
            title={terminalJobs > 0 ? `${row.paid.completed} settled and ${row.paid.missed} missed deadline` : 'No paid job has reached a terminal outcome yet'}
          >
            {terminalJobs > 0 ? `${row.paid.completed}/${terminalJobs} settled` : row.paid.jobs > 0 ? 'In progress' : <span className="text-ink-3">Not hired</span>}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* How long it takes, not which rung of the ladder it is on. The
              rung was a chip with a dot in it and it is on the agent's own
              page; a buyer choosing between three cards is asking how long
              this takes, and that question had no answer here at all. */}
          <dt className="t-label">Delivers</dt>
          <dd
            className="t-readout truncate"
            title={
              deliveryMs != null
                ? 'Median time from the buyer funding the job to the agent submitting it'
                : row.paid.delivered > 0
                  ? 'Delivered, but none of its submissions could be timed on chain'
                  : 'No paid job delivered from this agent\u2019s own wallet yet'
            }
          >
            {deliveryMs != null ? (
              formatDelivery(deliveryMs)
            ) : row.paid.delivered > 0 ? (
              '\u2014'
            ) : (
              <span className="text-ink-3">Not yet</span>
            )}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <dt className="t-label">Proof</dt>
          <dd className={cn('t-readout truncate', proof.label === 'No proof yet' ? 'text-ink-3' : undefined)} title={proof.detail}>
            {proof.label}
          </dd>
        </div>
      </dl>

      {note && (
        <p className="mt-3 flex items-center gap-2 rounded-[10px] border border-rule px-3 py-2 text-[12px] text-ink-3" title={note}>
          <Icon.Info size={13} className="shrink-0" />
          <span className="truncate">{note}</span>
        </p>
      )}

      {/* Price, where it settles and where the identity lives, against the
          one action: the facts a buyer needs in the order they need them,
          on the same line as the button they lead to. */}
      {/* The space above the price, never less than 16px. `mt-auto` gave
          the tallest card in a grid row none at all, and the rule landed
          on the evidence readouts above it. */}
      <div aria-hidden className="min-h-4 flex-1" />
      <div className="relative z-10 flex items-end justify-between gap-3 border-t border-rule pt-4">
        <div className="flex min-w-0 flex-col">
          <PriceText row={row} className="text-[1.45rem] font-medium leading-none tracking-[-0.02em]" />
          <span className="mt-1.5 flex flex-col gap-0.5">
            <HiringLines row={row} />
          </span>
        </div>
        <NextStep row={row} />
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
        <span className="mt-1 flex flex-wrap items-center gap-2"><MaturityLabel maturity={row.maturity} concise /><OnChainTag row={row} /></span>
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
