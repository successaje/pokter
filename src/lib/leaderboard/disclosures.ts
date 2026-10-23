import type { HiredJob } from '@/lib/erc8183/types';
import { formatCount } from '@/lib/ui/format';

import type { OutcomeRow } from './outcomes';

/**
 * Everything a row has to say about itself that is not a figure.
 *
 * These sentences were printed inline, stacked under the agent's name, and
 * on the production board they made the identity column a paragraph: five
 * lines of qualification between the name and the next row. Scanning the
 * table meant reading it. The redesign moves them into a details row under
 * each agent — but moving a disclosure behind a toggle is exactly how a
 * disclosure stops being one, so two rules hold here:
 *
 *   1. Nothing is dropped. Every sentence below is the one that was on the
 *      row before, word for word, including the ones that make an agent
 *      look worse.
 *   2. The collapsed summary **names** what is inside (`summaryOf`), built
 *      from this same list, so a reader who never opens it still learns
 *      that a buyer also wrote the attestations. A toggle labelled "details"
 *      would hide the fact; one labelled "2 buyers also reviewed" does not.
 *
 * Returned as data rather than rendered here so the summary and the body
 * cannot describe different things — the defect that ships on this page is
 * always a label that outlived what it labels.
 */
export type DisclosureTone = 'watch' | 'neutral';

export interface Disclosure {
  id: string;
  /** `watch` where the fact weakens the figures above it. */
  tone: DisclosureTone;
  /** A few words, for the collapsed summary. */
  summary: string;
  /** The whole sentence, as the row has always stated it. */
  detail: string;
  /** Receipts behind it. Empty where the fact has none. */
  jobs: readonly HiredJob[];
  /** What those receipts are, for screen readers. */
  jobsLabel: string;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function rowDisclosures(row: OutcomeRow): Disclosure[] {
  const out: Disclosure[] = [];

  if (!row.listed) {
    out.push({
      id: 'unlisted',
      tone: 'watch',
      summary: 'Not in the current listing',
      detail: 'Not in Pokter’s current listing; its receipts are still on chain.',
      jobs: [],
      jobsLabel: '',
    });
  }

  /*
   * Two courier shapes, said apart, because they settle identically on the
   * escrow and mean opposite things about the agent. One carries the agent's
   * own answer and one carries nothing of the agent's at all, and a reader
   * has to be able to tell "Pokter carried this agent's answer" from "Pokter
   * did the work". Neither counts towards the settled column.
   */
  if (row.relayedSettled > 0) {
    out.push({
      id: 'relayed',
      tone: 'neutral',
      summary: `${formatCount(row.relayedSettled)} relayed ${plural(row.relayedSettled, 'answer', 'answers')}`,
      detail:
        `${formatCount(row.relayedSettled)} further settled ${plural(row.relayedSettled, 'job', 'jobs')} submitted by ` +
        'Pokter’s courier carrying this agent’s own answer. The answer was the agent’s; the delivery was not. ' +
        'Not counted above.',
      jobs: row.relayed,
      jobsLabel: 'Relayed-answer receipts',
    });
  }

  if (row.courierSettled > 0) {
    out.push({
      id: 'courier',
      tone: 'watch',
      summary: `${formatCount(row.courierSettled)} courier ${plural(row.courierSettled, 'delivery', 'deliveries')}`,
      detail:
        `${formatCount(row.courierSettled)} further settled ${plural(row.courierSettled, 'job', 'jobs')} delivered by ` +
        'Pokter’s courier, with no answer of this agent’s in it. Not counted above.',
      jobs: row.courier,
      jobsLabel: 'Courier-delivered receipts',
    });
  }

  if (row.operatorBuyers > 0) {
    /*
     * The verb agrees with the count that governs it, which is the number
     * of operator-owned wallets and not the total beside it. Written with
     * the noun pluralised alone, a single one rendered "1 of 1 buyer wallet
     * here own a listed agent" — and a disclosure that reads as a slip is a
     * disclosure readers discount.
     */
    const owns = row.operatorBuyers === 1 ? 'owns' : 'own';
    out.push({
      id: 'operator-buyers',
      tone: 'watch',
      summary: `${formatCount(row.operatorBuyers)} ${plural(row.operatorBuyers, 'buyer', 'buyers')} ${owns} a listed agent`,
      detail:
        `${formatCount(row.operatorBuyers)} of ${formatCount(row.externalBuyers)} buyer ` +
        `${plural(row.externalBuyers, 'wallet', 'wallets')} here ${owns} a listed agent. Outside Pokter’s team ` +
        'set, and not independent of the marketplace.',
      jobs: [],
      jobsLabel: '',
    });
  }

  /*
   * Null is not zero, and the absent case is the one worth keeping visible:
   * an RPC that did not answer is not evidence that buyer and reviewer are
   * different parties, and this disclosure only means anything if its own
   * absence is on the page.
   */
  if (row.reviewerBuyers === null) {
    out.push({
      id: 'reviewers-unread',
      tone: 'neutral',
      summary: 'Attestation authors not read',
      detail: 'Attestation authors not read, so overlap with these buyers is unknown.',
      jobs: [],
      jobsLabel: '',
    });
  } else if (row.reviewerBuyers > 0) {
    out.push({
      id: 'reviewer-buyers',
      tone: 'watch',
      summary: `${formatCount(row.reviewerBuyers)} ${plural(row.reviewerBuyers, 'buyer', 'buyers')} also reviewed`,
      detail:
        `${formatCount(row.reviewerBuyers)} of these buyer wallets also wrote an on-chain attestation about this ` +
        'agent: buyer and reviewer are the same party.',
      jobs: [],
      jobsLabel: '',
    });
  }

  return out;
}

/** Receipts a row carries that are not attached to a disclosure. */
export function rowReceipts(row: OutcomeRow): ReadonlyArray<{ label: string; jobs: readonly HiredJob[] }> {
  return [
    { label: 'Settled receipts', jobs: row.settled },
    { label: 'Delivered, unsettled receipts', jobs: row.delivered },
  ].filter((group) => group.jobs.length > 0);
}

/**
 * The line on the closed toggle.
 *
 * Every disclosure is named, and the receipt count comes last, so the
 * weakening facts are what a reader sees without opening anything. A row
 * with nothing to disclose and no receipt gets null and renders no toggle
 * at all — an empty disclosure is a control that teaches readers the
 * control is empty.
 */
export function summaryOf(
  disclosures: readonly Disclosure[],
  receipts: ReadonlyArray<{ jobs: readonly HiredJob[] }>,
): string | null {
  const parts = disclosures.map((disclosure) => disclosure.summary);
  const count =
    receipts.reduce((sum, group) => sum + group.jobs.length, 0) +
    disclosures.reduce((sum, disclosure) => sum + disclosure.jobs.length, 0);
  if (count > 0) parts.push(`${formatCount(count)} ${plural(count, 'receipt', 'receipts')}`);
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Whether any disclosure on this row weakens the figures beside it. */
export function hasWatch(disclosures: readonly Disclosure[]): boolean {
  return disclosures.some((disclosure) => disclosure.tone === 'watch');
}
