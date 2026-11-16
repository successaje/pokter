import 'server-only';

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

export interface Walkthrough {
  job: { chainId: number; jobId: string; href: string; network: string };
  agent: { name: string; href: string };
  /** True when a Pokter wallet funded it: said on the page, never softened. */
  fundedByTeam: boolean;
  steps: WalkStep[];
}

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
  };
}

export type { JobEvidence };
