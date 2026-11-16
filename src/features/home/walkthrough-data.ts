import 'server-only';

import type { PlanCheckOutcome } from '@/lib/delivery/plan-checks';
import { loadJobEvidence, type JobEvidence } from '@/lib/jobs/evidence';
import { shortNetworkLabel, explorerBaseFor } from '@/lib/network/presentation';

/**
 * One real hire, as the six things that happened to it.
 *
 * The landing page plays a recording of this job being made — the real
 * screens, the real cursor, the real wallet — and this is what sits under
 * it. The recording shows; these rows say, and they are what can be
 * checked: every value is read from the job through `loadJobEvidence`, and
 * a field the job did not carry renders as missing rather than guessed.
 *
 * The two have to agree, which is the point of keeping them in one file's
 * reach. A recording is a record of a moment and will age; the rows are
 * read at build time and will not. Where they could drift the rows win,
 * and the caption under the film says when it was recorded so a reader can
 * tell which is which.
 *
 * The chapters are named for what the recording shows at that point, not
 * for an idealised flow, and the two that have no footage — the delivery
 * arriving, the review window closing — are not given chapters they cannot
 * fill. `HireFilm` holds the timings; this holds the facts.
 */

export interface WalkStep {
  key: 'find' | 'inspect' | 'fund' | 'sign' | 'funded' | 'checked';
  label: string;
  /** What this chapter is, in the page's voice, not the job's. */
  says: string;
  rows: Array<{ k: string; v: string; tone?: 'ok' | 'watch' | 'none'; href?: string }>;
  /** The caveat that belongs to this chapter, when one does. */
  foot?: string;
}

export interface Walkthrough {
  job: { chainId: number; jobId: string; href: string; network: string };
  agent: { name: string; href: string };
  /** True when a Pokter wallet funded it: said on the page, never softened. */
  fundedByTeam: boolean;
  steps: WalkStep[];
  /** Totals the caption needs without walking the rows. */
  checks: { passed: number; failed: number; total: number };
}

const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

/**
 * The walkthrough for one job, or null when that job cannot carry it.
 *
 * Refuses rather than fills: a job whose delivery was not read, or whose
 * answer the buyer has not published, cannot carry the last chapter, and a
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
  const count = (outcome: PlanCheckOutcome) => e.checks!.checks.filter((c) => c.outcome === outcome).length;
  const passed = count('passed');
  const failed = count('failed');

  const steps: WalkStep[] = [
    {
      key: 'find',
      label: 'Find',
      says: 'Describe the outcome in your own words. Pokter ranks the agents it has measured doing that kind of work, on what they did rather than on what they say.',
      rows: [
        { k: 'The brief', v: e.brief ? e.brief.replace(/\s+/g, ' ').trim().slice(0, 180) : 'Written by the buyer' },
        { k: 'Shelved under', v: e.checks.label },
      ],
      foot: 'A category is where a task is shelved, not a claim that the work behind it passed a check.',
    },
    {
      key: 'inspect',
      label: 'Inspect',
      says: 'Read what the agent has actually done before you spend anything: how often it answered, how fast, what it has delivered, and the price its own wallet signed.',
      rows: [
        { k: 'The agent', v: e.agent.name, href: agentHref },
        { k: 'Identity', v: `ERC-8004 #${e.agent.tokenId} on ${network}`, tone: 'ok' },
        { k: 'Price', v: `${e.amount}, signed by its own wallet`, tone: 'ok' },
      ],
      foot: 'A price exists only in a quote the agent signed. Pokter checks that signature against the wallet in its registration, and shows no price when the two do not match.',
    },
    {
      key: 'fund',
      label: 'Fund',
      says: 'Write the brief in your own words, then read the terms the agent is accepting before any wallet opens.',
      rows: [
        { k: 'Held by', v: `ERC-8183 escrow on ${network}`, tone: 'ok' },
        { k: 'Paid out when', v: 'The answer is delivered and the review window passes', tone: 'ok' },
        { k: 'Granted over your wallet', v: 'Nothing, so there is nothing to revoke', tone: 'ok' },
      ],
    },
    {
      key: 'sign',
      label: 'Sign',
      says: 'Fund one escrow for one job. The wallet that opens is yours \u2014 Pokter holds no key, cannot sign for you, and never takes custody of the money.',
      rows: [
        e.fundingTx
          ? { k: 'Funded', v: shortHash(e.fundingTx), tone: 'ok' as const, href: `${explorer}/tx/${e.fundingTx}` }
          : { k: 'Funded', v: 'Transaction not recorded', tone: 'none' as const },
        { k: 'Signed in', v: 'The buyer’s own wallet', tone: 'ok' },
        { k: 'Network', v: network },
      ],
      foot: 'Two signatures, not one: the escrow is approved for exactly the budget, then funded. Nothing wider is approved and nothing is left standing.',
    },
    {
      key: 'funded',
      label: 'Funded',
      says: 'The escrow is approved for exactly the budget, then funded. The job now exists on chain: the agent can be paid only by delivering against it, and if nothing arrives the money comes back.',
      rows: [
        { k: 'Job', v: `#${e.jobId} on ${network}`, tone: 'ok' },
        { k: 'Funded at', v: when(e.hiredAt) },
        ...(e.expiresAt ? [{ k: 'Deadline', v: when(e.expiresAt) }] : []),
      ],
      foot: 'A job that expires undelivered returns the buyer’s money. The record on this site counts those in the open, beside the ones that settled.',
    },
    {
      key: 'checked',
      label: 'Checked',
      says: 'The answer arrives against a hash committed before it existed, and Pokter recomputes the figures it reports from the source’s own contracts.',
      rows: [
        { k: 'Committed hash', v: e.chain ? shortHash(e.chain.deliverable) : 'Not read from chain' },
        { k: 'File against hash', v: 'Matches', tone: 'ok' },
        { k: 'Method', v: e.checks.method },
        { k: 'Agreed', v: `${passed} of ${e.checks.checks.length}`, tone: failed > 0 ? 'watch' : 'ok' },
        ...(failed > 0 ? [{ k: 'Disagreed', v: String(failed), tone: 'watch' as const }] : []),
      ],
      /*
       * The sentence the whole page turns on. A settled escrow says the
       * mechanism worked; it says nothing about whether the buyer is better
       * off, and the two must never be shown as one result.
       */
      foot: 'A delivered plan and a settled escrow do not establish a financial outcome. Nothing here is a claim about money made.',
    },
  ];

  return {
    job: { chainId: e.chainId, jobId: e.jobId, href: `/jobs/${e.chainId}/${e.jobId}`, network },
    agent: { name: e.agent.name, href: agentHref },
    /*
      Said plainly on the page. `team` is a Pokter wallet and `self` is the
      agent hiring itself; neither is a customer, and a walkthrough that let
      either pass as one would be the worst sentence on the site.
    */
    fundedByTeam: e.funder !== 'outside',
    steps,
    checks: { passed, failed, total: e.checks.checks.length },
  };
}

export type { JobEvidence };
