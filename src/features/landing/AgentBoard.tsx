'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';

import type { FindRow } from '@/lib/find/rows';
import type { SheetCard } from '@/lib/landing/sheet';
import { VERDICT_LABEL, VERDICT_MEANING, type Verdict } from '@/lib/proof/engine';
import { cn } from '@/lib/ui/cn';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { Ago } from '@/ui/Ago';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { Icon } from '@/ui/icons';
import { NetworkTag } from '@/ui/Network';
import { PointerGrid } from '@/ui/PointerGrid';
import { VERDICT_TONE, VerdictGlyph } from '@/ui/Verdict';

/**
 * The agents somebody can actually hire today, laid out as a sheet.
 *
 * Carried over from the landing rebuild (feat/landing-rebuild). Cards with
 * gaps between them read as eight separate things that happen to be near
 * each other; ruled into one lattice they read as a sheet of the catalogue
 * with eight of it filled in, which is what this is. The other cells carry
 * work somebody funded, a request somebody posted and the figure the page
 * rests on, and the blank ones show the graph paper underneath — a cell
 * with nothing in it is not an agent Pokter declined to name, so blanks are
 * hidden from assistive technology.
 *
 * The sheet fills along its diagonal as it scrolls in, once.
 */

export type BoardAgent = FindRow & { hireChainIds: number[]; purpose: string };

const EASE = [0.2, 0.8, 0.2, 1] as const;
const COLUMNS = 4;
const CELLS = 16;
/** Where the agents sit, where the rest of the marketplace sits, and where the sheet shows through. */
const AGENTS = [0, 1, 4, 6, 9, 11, 12, 15];
const OTHERS = [3, 5, 8, 13];

const when = (since: number | null) => (since === null ? 'Never answered' : since === 0 ? 'Answered today' : `Answered ${since}d ago`);

const isAgent = (item: BoardAgent | SheetCard): item is BoardAgent => !('kind' in item);

/* The site's own verdict tones, so a cell here and a card on Discover colour a verdict the same way. */
const WASH = {
  ok: 'bg-ok-wash text-ok',
  watch: 'bg-watch-wash text-watch',
  info: 'bg-info-wash text-info',
  bad: 'bg-bad-wash text-bad',
  none: 'bg-none-wash text-ink-2',
} as const;

/** The verdict, small enough to sit in a cell. Its meaning is the cell link's job, so no title here. */
function Status({ verdict }: { verdict: Verdict }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium', WASH[VERDICT_TONE[verdict]])}>
      <VerdictGlyph verdict={verdict} size={9} />
      {VERDICT_LABEL[verdict]}
      <span className="sr-only">: {VERDICT_MEANING[verdict]}</span>
    </span>
  );
}

const SHELL =
  'group flex h-full min-h-[204px] flex-col gap-2.5 p-5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink';

function OtherCard({ card }: { card: SheetCard }) {
  if (card.kind === 'work') {
    return (
      <Link href={card.href ?? '/proof'} className={cn(SHELL, 'bg-paper hover:bg-raised')}>
        <span className="t-label">Work delivered</span>
        <p className="text-[13.5px] leading-relaxed text-ink">{card.text}</p>
        {/* Whose money it was, in the words: a hire of Pokter's own passing as a customer's is the one misreading this cannot allow. */}
        <span className="text-[11.5px] text-ink-3">{card.ours ? 'Funded by Pokter, not by a customer' : 'Funded by a buyer outside Pokter'}</span>
        <div className="mt-auto flex items-baseline justify-between gap-3">
          {card.amount ? <span className="t-readout text-[14px] text-ink">{card.amount}</span> : <span className="text-[12.5px] text-ink-3">Amount not read</span>}
          <span className="shrink-0 text-[11px] text-ink-3">
            <Ago at={card.at} />
          </span>
        </div>
      </Link>
    );
  }

  if (card.kind === 'request') {
    return (
      <Link href={card.href} className={cn(SHELL, 'bg-paper hover:bg-raised')}>
        <span className="t-label">Open request</span>
        {/* A buyer's own sentence, quoted rather than paraphrased, and with nobody's name on it. */}
        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink">&ldquo;{card.title}&rdquo;</p>
        <div className="mt-auto flex items-baseline justify-between gap-3">
          {card.budget ? <span className="t-readout text-[14px] text-ink">{card.budget}</span> : <span className="text-[12.5px] text-ink-3">No budget set</span>}
          <span className="shrink-0 text-[11px] text-ink-3">{card.proposals === 1 ? '1 proposal' : `${card.proposals} proposals`}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={card.href} className={cn(SHELL, 'bg-signal-wash/60 hover:bg-signal-wash')}>
      <span className="t-label">The record</span>
      <span className="t-readout text-[40px] leading-none tracking-[-0.04em] text-ink">{card.value}</span>
      <p className="text-[12.5px] leading-relaxed text-ink-2">{card.label}</p>
      <span className="mt-auto text-[11.5px] text-ink-3">{card.note}</span>
    </Link>
  );
}

function AgentCell({ agent }: { agent: BoardAgent }) {
  const price = agent.priceState === 'signed' ? agent.priceLabel : null;
  return (
    <Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className={cn(SHELL, 'bg-raised hover:bg-paper')}>
      <div className="flex items-start gap-3">
        {/* The one thing on the cell with a face, so it is the one thing that answers the pointer. */}
        <span className="shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:scale-[1.08]">
          <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.key} size={34} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium tracking-[-0.015em] text-ink">{agent.name}</span>
          <span className="truncate text-[11.5px] text-ink-3">{agent.categoryLabel}</span>
        </span>
      </div>

      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">{agent.purpose}</p>

      {/* The fortnight of calls, drawn only when something was measured in it. */}
      {agent.cells.some((cell) => cell.probes > 0) && (
        <ProbeStrip cells={agent.cells} scale={16} className="h-3.5" label={`${agent.name}: daily answer rate over the last fortnight`} />
      )}

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Status verdict={agent.verdict} />
          {/* Where its money settles, across its registrations, the way every card on the site says it. */}
          <NetworkTag chainId={agent.hireChainId} alsoHireOn={agent.hireChainIds} />
        </div>
        <span className="flex min-w-0 items-baseline gap-1.5" title={price && !agent.priceFresh ? 'Last signed escrow quote' : 'Escrow quote'}>
          {price ? (
            <>
              <span className="t-readout truncate text-[14px] text-ink">{price}</span>
              {!agent.priceFresh && <span className="shrink-0 text-[10.5px] text-ink-3">last signed</span>}
            </>
          ) : (
            <span className="truncate text-[12.5px] text-ink-3">No signed price</span>
          )}
        </span>
        <div className="flex items-center justify-between gap-3 text-[11px] text-ink-3">
          <span className="truncate">
            {when(agent.sinceAnswer)} &middot; {agent.paid.completed > 0 ? `${agent.paid.completed} delivered` : 'none delivered yet'}
          </span>
          <span className="flex shrink-0 translate-x-1 items-center gap-1 font-medium text-ink opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
            View <Icon.Arrow size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function AgentBoard({ agents, cards }: { agents: BoardAgent[]; cards: SheetCard[] }) {
  const hydrated = useHydrated();
  const still = (useReducedMotion() ?? false) && hydrated;
  if (agents.length === 0) return null;

  /* Agents into their slots, overflow into the spare cells, then the other cards; whatever is left is sheet. */
  const spare = Array.from({ length: CELLS }, (_, i) => i).filter((i) => !AGENTS.includes(i) && !OTHERS.includes(i));
  const agentOrder = [...AGENTS, ...spare];
  const placed = new Map<number, BoardAgent | SheetCard>(agents.slice(0, agentOrder.length).map((agent, i) => [agentOrder[i]!, agent]));
  cards.slice(0, OTHERS.length).forEach((card, i) => placed.set(OTHERS[i]!, card));
  const cells = Array.from({ length: CELLS }, (_, slot) => ({ slot, item: placed.get(slot) ?? null }));

  return (
    /*
     * The paper lies under the whole sheet and shows only through its blank
     * cells, so those are the cells that answer the pointer: the lattice
     * brightens as it comes near, the squares it crosses light, and one it
     * rests on answers. The cells with something in them sit on top,
     * opaque, and stay still.
     */
    <div data-grid-host className="relative">
      <PointerGrid className="graph-paper hidden lg:block" />
    {/*
     * A row to swipe on a phone, a sheet from a tablet up. Stacked, eleven
     * cells were three screens between the film and everything else; the
     * cell cut off at the edge is what says there are more.
     */}
    <ul aria-label="Hireable agents, and what is happening around them" className="relative z-[1] -mr-4 flex snap-x snap-mandatory overflow-x-auto border-l border-t border-rule [scrollbar-width:none] sm:mr-0 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
      {cells.map(({ slot, item }) => {
        /* A diagonal, so the sheet fills from its own top-left corner. */
        const delay = still ? 0 : ((slot % COLUMNS) + Math.floor(slot / COLUMNS)) * 0.06;
        const motionProps = {
          initial: still ? false : { opacity: 0, y: 10 },
          whileInView: { opacity: 1, y: 0 },
          /*
           * Once: a cell that re-animates every time it scrolls back is a
           * widget, not a page. Any sliver counts as seen, so on a phone the
           * cell cut off at the edge of the row is drawn, not left blank.
           */
          viewport: { once: true, amount: 0.02 },
          transition: { delay, duration: 0.55, ease: EASE },
        } as const;

        if (!item) {
          return (
            <motion.li
              key={`gap-${slot}`}
              aria-hidden
              className="hidden border-b border-r border-rule lg:block"
              initial={still ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay, duration: 0.5, ease: EASE }}
            />
          );
        }
        return (
          <motion.li key={item.key} className="w-[80vw] max-w-[320px] shrink-0 snap-start border-b border-r border-rule sm:w-auto sm:max-w-none" {...motionProps}>
            {isAgent(item) ? <AgentCell agent={item} /> : <OtherCard card={item} />}
          </motion.li>
        );
      })}
    </ul>
    </div>
  );
}
