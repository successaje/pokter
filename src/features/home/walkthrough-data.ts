import 'server-only';

import type { Category } from '@/lib/agents/categories';
import type { PlanCheckOutcome, PlanKind } from '@/lib/delivery/plan-checks';
import { loadJobEvidence, type JobEvidence } from '@/lib/jobs/evidence';
import { shortNetworkLabel, explorerBaseFor } from '@/lib/network/presentation';

/**
 * One real hire, as the five things that happened to it.
 *
 * The page needs to show what hiring here is actually like. A recording of
 * the product does that, and was the first attempt: it is the real screens,
 * which is the whole argument. But a recording is baked in one theme, is
 * unreadable at phone width, carries no text a screen reader can reach, goes
 * stale the moment a screen changes, and costs megabytes.
 *
 * So the walkthrough is drawn rather than filmed, and every value in it is
 * read from a job that really happened. That is the same rule `EvidenceChain`
 * keeps: nothing is composed, nothing is typical, and a field Pokter could
 * not read renders as unread rather than as a plausible number. A drawing of
 * a real job is not a dramatisation; a drawing of an imagined one would be,
 * and this file is the line between them.
 *
 * The recording still exists and is linked beside it, for anyone who would
 * rather watch the screens than read the record.
 */

export interface WalkStep {
  key: 'find' | 'inspect' | 'fund' | 'delivered' | 'checked';
  label: string;
  /** What this step is, in the page's voice, not the job's. */
  says: string;
  rows: Array<{ k: string; v: string; tone?: 'ok' | 'watch' | 'none'; href?: string }>;
  /** The caveat that belongs to this step, when one does. */
  foot?: string;
}

/**
 * The live values the walkthrough's screens draw, beyond the fact rows.
 *
 * The screens are a reconstruction of the product, so every string on them
 * has to come from the job rather than from a designer: the brief is the
 * brief the buyer wrote, the price is the price the agent signed, the
 * hashes are the hashes on chain, the checks are the checks that ran and
 * what each of them found. Nothing here is written for the page. A field
 * the job did not carry is null and the screen says so, the same way the
 * rows do.
 */
export interface WalkScene {
  /** What was asked for, typed out on the first screen as the buyer typed it. */
  brief: string;
  /** The shelf the task was filed under, and the marketplace category it maps to. */
  shelf: { label: string; category: Category | null };
  agent: { name: string; mark: string | null; tokenId: string };
  price: string;
  escrow: string;
  fundingTx: { short: string; href: string } | null;
  deliverable: string | null;
  deliveredAt: string | null;
  method: string;
  /** Every check that ran, in the order it ran, with what it found. */
  checks: Array<{ label: string; outcome: PlanCheckOutcome; detail: string }>;
  /** What the checks do not cover, in the checker's own words. */
  notCovered: string[];
  /** The real path each screen is at, shown in the window's address bar. */
  paths: Record<WalkStep['key'], string>;
}

export interface Walkthrough {
  job: { chainId: number; jobId: string; href: string; network: string };
  agent: { name: string; href: string };
  /** True when a Pokter wallet funded it: said on the page, never softened. */
  fundedByTeam: boolean;
  steps: WalkStep[];
  scene: WalkScene;
}

/**
 * The marketplace shelf a kind of answer is sold from.
 *
 * The checker's `kind` is read from what was delivered; the category is
 * where Pokter lists agents. They are two vocabularies for the same work
 * and this is the only place they meet, so the first screen can show the
 * real shelf the buyer would have been searching rather than a label
 * written for the screenshot.
 */
const SHELF: Record<PlanKind, Category> = {
  health: 'health-factor',
  yield: 'yield',
  grid: 'grid-trading',
  range: 'rebalancing',
  token: 'token-safety',
  research: 'research',
  trading: 'trading',
  content: 'content',
};

/** Pokter's own agents are drawn with their own mark; anyone else's is an initial. */
const HOUSE_MARKS = new Set(['brinkwatch', 'centreline', 'cresthold', 'gridloom', 'touchstone']);

const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/**
 * The walkthrough for one job, or null when that job cannot carry it.
 *
 * Refuses rather than fills: a job whose delivery was not read, or whose
 * answer the buyer has not published, cannot show the last two steps, and a
 * walkthrough missing its payoff is worse than none. The caller picks the
 * job; this decides whether it can be shown.
 */
export async function walkthroughFor(chainId: 56 | 97, jobId: string): Promise<Walkthrough | null> {
  const e = await loadJobEvidence(chainId, jobId);
  if (!e) return null;
  if (e.delivery.state !== 'matches') return null;
  if (!e.checks || e.checks.checks.length === 0) return null;

  const explorer = explorerBaseFor(e.chainId);
  const network = shortNetworkLabel(e.chainId);
  const agentHref = `/agents/${e.agent.chainId}/${e.agent.tokenId}`;
  // `amount` already carries its token and chain (`jobAmountLabel`).
  const passed = e.checks.checks.filter((c) => c.outcome === 'passed').length;
  const failed = e.checks.checks.filter((c) => c.outcome === 'failed').length;
  const unchecked = e.checks.checks.length - passed - failed;

  const steps: WalkStep[] = [
    {
      key: 'find',
      label: 'Find',
      says: 'Describe the outcome in your own words. Pokter ranks the agents it has measured doing that kind of work.',
      rows: [
        { k: 'The brief', v: e.brief ? e.brief.replace(/\s+/g, ' ').trim().slice(0, 180) : 'Written by the buyer' },
        { k: 'Shelved under', v: e.checks.label },
      ],
      foot: 'A category is where a task is shelved, not a claim that the work behind it passed a check.',
    },
    {
      key: 'inspect',
      label: 'Inspect',
      says: 'Read what the agent has actually done before you spend anything.',
      rows: [
        { k: 'The agent', v: e.agent.name, href: agentHref },
        { k: 'Identity', v: `ERC-8004 #${e.agent.tokenId} on ${network}`, tone: 'ok' },
        { k: 'Price', v: `${e.amount}, signed by its own wallet`, tone: 'ok' },
      ],
      foot: 'A price exists only in a quote the agent signed. Pokter checks the signature against its registered wallet.',
    },
    {
      key: 'fund',
      label: 'Fund',
      says: 'One escrow, for one job. The agent cannot take it and Pokter cannot move it.',
      rows: [
        { k: 'Held by', v: `ERC-8183 escrow on ${network}`, tone: 'ok' },
        { k: 'Granted over your wallet', v: 'Nothing, so there is nothing to revoke', tone: 'ok' },
        e.fundingTx
          ? { k: 'Funded', v: shortHash(e.fundingTx), tone: 'ok' as const, href: `${explorer}/tx/${e.fundingTx}` }
          : { k: 'Funded', v: 'Transaction not recorded', tone: 'none' as const },
      ],
    },
    {
      key: 'delivered',
      label: 'Delivered',
      says: 'The agent commits a hash before it hands anything over, so the file cannot change afterwards.',
      rows: [
        { k: 'Committed hash', v: e.chain ? shortHash(e.chain.deliverable) : 'Not read from chain' },
        { k: 'File against hash', v: 'Matches', tone: 'ok' },
        ...(e.deliveredAt
          ? [{ k: 'Delivered', v: new Date(e.deliveredAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' }]
          : []),
      ],
      foot: 'A file that does not match the hash committed for it is not a delivery, and is not counted as one.',
    },
    {
      key: 'checked',
      label: 'Checked',
      says: `Pokter recomputed the figures the agent reported, from the source's own contracts.`,
      rows: [
        { k: 'Method', v: e.checks.method },
        { k: 'Agreed', v: `${passed} of ${e.checks.checks.length}`, tone: failed > 0 ? 'watch' : 'ok' },
        ...(failed > 0 ? [{ k: 'Disagreed', v: String(failed), tone: 'watch' as const }] : []),
        ...(unchecked > 0 ? [{ k: 'Not checked', v: String(unchecked), tone: 'none' as const }] : []),
      ],
      /*
       * The sentence the whole page turns on. A settled escrow says the
       * mechanism worked; it says nothing about whether the buyer is better
       * off, and the two must never be shown as one result.
       */
      foot: 'A delivered plan and a settled escrow do not establish a financial outcome. Nothing here is a claim about money made.',
    },
  ];

  const markSlug = e.agent.name.toLowerCase().replace(/\s*by pokter$/, '').trim();

  return {
    job: { chainId: e.chainId, jobId: e.jobId, href: `/jobs/${e.chainId}/${e.jobId}`, network },
    agent: { name: e.agent.name, href: agentHref },
    scene: {
      brief: e.brief ? e.brief.replace(/\s+/g, ' ').trim() : '',
      shelf: { label: e.checks.label, category: e.checks.kind ? SHELF[e.checks.kind] : null },
      agent: {
        name: e.agent.name,
        mark: HOUSE_MARKS.has(markSlug) ? `/agents/${markSlug}.svg` : null,
        tokenId: e.agent.tokenId,
      },
      price: e.amount,
      escrow: `ERC-8183 escrow on ${network}`,
      fundingTx: e.fundingTx ? { short: shortHash(e.fundingTx), href: `${explorer}/tx/${e.fundingTx}` } : null,
      deliverable: e.chain ? shortHash(e.chain.deliverable) : null,
      deliveredAt: e.deliveredAt
        ? new Date(e.deliveredAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
        : null,
      method: e.checks.method,
      checks: e.checks.checks.map((c) => ({ label: c.label, outcome: c.outcome, detail: c.detail })),
      notCovered: e.checks.notCovered,
      paths: {
        find: '/discover',
        inspect: agentHref,
        fund: `/hire/${e.agent.chainId}/${e.agent.tokenId}`,
        delivered: `/jobs/${e.chainId}/${e.jobId}`,
        checked: `/jobs/${e.chainId}/${e.jobId}#checks`,
      },
    },
    /*
      Said plainly on the page. `team` is a Pokter wallet and `self` is the
      agent hiring itself; neither is a customer, and a walkthrough that let
      either pass as one would be the worst sentence on the site.
    */
    fundedByTeam: e.funder !== 'outside',
    steps,
  };
}

export type { JobEvidence };

/** One agent as the shelf lists it, flattened for the screens to draw. */
export interface ShelfRow {
  key: string;
  name: string;
  /** Pokter's own agents carry their mark; anyone else's gets an initial. */
  mark: string | null;
  note: string;
  /** True for the agent this job actually hired: the row the cursor lands on. */
  hired: boolean;
}

export interface Shelf {
  label: string;
  /** How many agents are listed on this shelf, from the same count Discover shows. */
  count: number;
  rows: ShelfRow[];
}

/**
 * The shelf the first screen shows, from the live catalogue.
 *
 * The screen is a search result, and a search result full of invented
 * competitors would be the one dishonest thing in the walkthrough: a
 * reader would be looking at a ranking that never ran. So the rows are the
 * shortlist Discover itself shows for that category, the count is the one
 * Discover counts, and each row carries what Pokter measured rather than
 * what the agent says.
 *
 * The agent that was actually hired has to be in the list, because the
 * cursor lands on it. It is often a different registration from the one the
 * shortlist ranks — the shortlist leads with mainnet and this job ran on
 * testnet — so it is matched by name and added when the shortlist does not
 * already carry it.
 *
 * Added last, and never first. Put at the top it would read as the agent
 * the ranking chose, which is a claim about a ranking that did not run; at
 * the bottom, marked as the one this job hired, it says the true thing
 * instead — the measurements ranked these, and the buyer picked that one.
 */
export function shelfFor(
  walk: Walkthrough,
  outcomes: Array<{ id: Category; label: string; count: number; top: Array<{ key: string; name: string; rate: number | null; priceState: 'signed' | 'unverified' | 'none' }> }>,
): Shelf | null {
  const category = walk.scene.shelf.category;
  if (!category) return null;
  const outcome = outcomes.find((o) => o.id === category);
  if (!outcome) return null;

  const markFor = (name: string) => {
    const slug = name.toLowerCase().replace(/\s*by pokter$/, '').trim();
    return HOUSE_MARKS.has(slug) ? `/agents/${slug}.svg` : null;
  };

  const asRow = (row: { key: string; name: string; rate: number | null; priceState: 'signed' | 'unverified' | 'none' }): ShelfRow => ({
    key: row.key,
    name: row.name,
    mark: markFor(row.name),
    note: [
      row.rate === null ? 'Never answered' : `${Math.round(row.rate * 100)}% of checks answered`,
      row.priceState === 'signed' ? 'price signed' : row.priceState === 'unverified' ? 'no verified price' : 'no price',
    ].join(' · '),
    hired: row.name === walk.scene.agent.name,
  });

  const ranked = outcome.top.map(asRow);
  const carriesHired = ranked.some((row) => row.hired);
  const rows = carriesHired
    ? ranked.slice(0, 3)
    : [
        ...ranked.slice(0, 2),
        {
          key: `hired:${walk.job.chainId}:${walk.scene.agent.tokenId}`,
          name: walk.scene.agent.name,
          mark: walk.scene.agent.mark,
          note: `${walk.scene.price}, signed by its wallet`,
          hired: true,
        },
      ];

  return { label: outcome.label, count: outcome.count, rows };
}
