import 'server-only';

import type { EcosystemStats } from '@/lib/marketplace';
import { requestRows } from '@/features/briefs/request-rows';
import { jobAmountLabel, jobToken } from '@/lib/erc8183/job-amount';
import type { getJobStore } from '@/lib/erc8183/store';
import type { FindRow } from '@/lib/find/rows';
import { getProbeStore } from '@/lib/history/store';
import { jobEvidencePath, jobFunder } from '@/lib/jobs/evidence-view';

/*
 * What the landing page's sheet and activity row are made of.
 *
 * Ported from the landing rebuild (feat/landing-rebuild), where both were
 * designed: the board is a sheet of the catalogue with eight agents filled
 * in, and between them three cells that are not agents — work that was
 * funded and delivered, a request somebody posted, and the figure the page
 * rests on. Every cell is read from a store the home page already reads,
 * and a kind with nothing to show returns nothing rather than a placeholder:
 * a cell invented to balance a grid is the one thing a sheet like this must
 * never contain.
 */

type Jobs = ReturnType<ReturnType<typeof getJobStore>['all']>;

/** A cell on the hireable sheet that is not an agent. */
export type SheetCard =
  | {
      kind: 'work';
      key: string;
      /** What happened, in the same words the activity row uses. */
      text: string;
      amount: string | null;
      /** True when Pokter funded it. Said in the words, never only in a colour. */
      ours: boolean;
      at: string;
      href: string | null;
    }
  | {
      kind: 'request';
      key: string;
      /** A buyer's own words. Rendered as data, never as an instruction. */
      title: string;
      budget: string | null;
      proposals: number;
      href: string;
    }
  | {
      kind: 'stat';
      key: string;
      value: string;
      label: string;
      note: string;
      href: string;
    };

/** One thing that happened: a call answered or missed, or an escrow moving. */
export interface TickerItem {
  key: string;
  kind: 'answered' | 'missed' | 'funded' | 'delivered' | 'settled' | 'returned';
  text: string;
  at: string;
  href: string | null;
  tone: 'proven' | 'ok' | 'watch' | 'info' | 'bad' | 'none';
}

const agentHref = (chainId: number, tokenId: string) => `/agents/${chainId}/${tokenId}`;

/**
 * The sheet's non-agent cells: the latest delivered job, the open request
 * closing soonest, and the answered-of-called figure. Whose money a job was
 * travels with its card and is printed, because a hire of Pokter's own
 * passing as a customer's is the one misreading this page cannot allow.
 */
export function sheetCards(jobs: Jobs, team: Set<string>, stats: EcosystemStats | null, answeredJobs: number): SheetCard[] {
  const cards: SheetCard[] = [];

  const done = jobs
    .filter((job) => job.status === 'COMPLETED' && job.hiredAt)
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt))[0];
  if (done) {
    cards.push({
      kind: 'work',
      key: `work:${done.chainId}:${done.jobId}`,
      text: `${done.agentName} delivered job #${done.jobId}`,
      amount: jobToken({ chainId: done.chainId, paymentToken: done.paymentToken ?? null })
        ? jobAmountLabel({ chainId: done.chainId, paymentToken: done.paymentToken ?? null, budgetRaw: done.budgetRaw })
        : null,
      ours: jobFunder({ client: done.client ?? null, provider: done.provider }, team) !== 'outside',
      at: done.hiredAt,
      href: jobEvidencePath(done),
    });
  }

  const far = Number.MAX_SAFE_INTEGER;
  const closes = (at: string | null | undefined) => (at ? Date.parse(at) || far : far);
  const open = requestRows(Date.now())
    .filter((row) => row.taking)
    .sort((a, b) => closes(a.closesAt) - closes(b.closesAt))[0];
  if (open) {
    cards.push({
      kind: 'request',
      key: `request:${open.id}`,
      title: open.title,
      budget: open.budgetU ? `${open.budgetU} $U` : null,
      proposals: open.proposals,
      href: `/requests/${open.id}`,
    });
  }

  /* Absent rather than zero when the sweep could not be read: "we could not reach it" and "nothing answered" are different sentences. */
  if (stats && stats.agentsMonitored > 0) {
    cards.push({
      kind: 'stat',
      key: 'stat:answered',
      value: stats.agentsAnswering.toLocaleString('en-US'),
      label: `of ${stats.agentsMonitored.toLocaleString('en-US')} agents called have ever answered`,
      note: `${answeredJobs.toLocaleString('en-US')} paid ${answeredJobs === 1 ? 'job' : 'jobs'} answered for buyers outside Pokter`,
      href: '/methodology',
    });
  }

  return cards;
}

/** How many entries the activity row carries, and how many of them escrow events may hold. */
const SLOTS = 28;
const WORK_SLOTS = 12;

/**
 * The activity row: recent calls, answered and missed, and recent escrow
 * events. Misses are first-class — they are most of the record.
 *
 * Each stream gets an allowance before the two are sorted by time, because a
 * sweep writes its probes in a burst and the newest 28 of everything would
 * otherwise be one sweep's misses and not one hire. The allowance decides
 * which burst may fill the row; it never drops a miss to make room for an
 * answer, and never changes what any entry says.
 */
export function tickerItems(rows: FindRow[], jobs: Jobs, team: Set<string>): TickerItem[] {
  const name = new Map(rows.map((row) => [row.key, row.name]));
  const href = new Map(rows.map((row) => [row.key, agentHref(row.chainId, row.tokenId)]));
  const items: TickerItem[] = [];

  for (const probe of getProbeStore().recent(50)) {
    const key = `${probe.chainId}:${probe.tokenId}`;
    const who = name.get(key);
    /* An agent Pokter cannot name is one it no longer lists; an entry for it would lead nowhere. */
    if (!who) continue;
    items.push({
      key: `probe:${key}:${probe.probedAt}`,
      kind: probe.ok ? 'answered' : 'missed',
      text: probe.ok ? `${who} answered${probe.latencyMs ? ` in ${probe.latencyMs}ms` : ''}` : `${who} did not answer`,
      at: probe.probedAt,
      href: href.get(key) ?? null,
      tone: probe.ok ? 'ok' : 'bad',
    });
  }

  for (const job of jobs) {
    if (!(job.hireTxHash || job.settleTxHash || job.reclaimTxHash)) continue;
    const amount = jobToken({ chainId: job.chainId, paymentToken: job.paymentToken ?? null })
      ? jobAmountLabel({ chainId: job.chainId, paymentToken: job.paymentToken ?? null, budgetRaw: job.budgetRaw })
      : null;
    const ours = jobFunder({ client: job.client ?? null, provider: job.provider }, team) !== 'outside';
    const settled = job.status === 'COMPLETED';
    const returned = job.status === 'EXPIRED' || job.status === 'REJECTED';
    /* Said in the words, not only in the colour: a grey dot is a convention a first-time reader cannot decode. */
    const mine = ours ? ' · ours' : '';
    items.push({
      key: `job:${job.chainId}:${job.jobId}`,
      kind: settled ? 'settled' : returned ? 'returned' : job.status === 'SUBMITTED' ? 'delivered' : 'funded',
      text: settled
        ? `${job.agentName} delivered job #${job.jobId}${amount ? ` · ${amount}` : ''}${mine}`
        : returned
          ? `Job #${job.jobId} ended undelivered — ${amount ?? 'the escrow'} returned${mine}`
          : job.status === 'SUBMITTED'
            ? `${job.agentName} delivered against its committed hash${mine}`
            : `${amount ?? 'An escrow'} funded → ${job.agentName}${mine}`,
      at: job.hiredAt,
      href: jobEvidencePath(job),
      tone: ours ? 'none' : settled ? 'proven' : returned ? 'watch' : 'info',
    });
  }

  const newest = (list: TickerItem[], n: number) => list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, n);
  const work = newest(items.filter((item) => item.key.startsWith('job:')), WORK_SLOTS);
  const calls = newest(items.filter((item) => item.key.startsWith('probe:')), SLOTS - work.length);
  return [...work, ...calls].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
