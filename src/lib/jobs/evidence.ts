import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';
import type { Hex } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { readDeliveredAnswer, type DeliveredAnswer } from '@/lib/delivery/answer';
import { readDeliveryText } from '@/lib/delivery/read-delivery';
import { correctedErc8183Addresses, escrowCommerceAddress } from '@/lib/erc8183/addresses';
import { disputeWindowSeconds } from '@/lib/erc8183/dispute-window';
import { jobAmountLabel } from '@/lib/erc8183/job-amount';
import { jobPaymentTokenOnChain } from '@/lib/erc8183/job-onchain';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { reviewWindowSummary } from '@/lib/erc8183/settle-window';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { jobReceipt } from '@/lib/jobs/receipt-link';
import { teamWalletSet } from '@/lib/team/server';
import { answerIsPublic } from './answer-publication';

import { briefIsPublic, jobFunder, publishableAnswerText, wasDelivered, type JobFunder } from './evidence-view';

/**
 * Everything the public evidence page says about one job, read once.
 *
 * Only jobs in Pokter's own index have a page — the jobs it commissioned
 * and verified against the escrow before indexing, the same set the
 * receipts API publishes. Any other escrow job is a stranger's, and has
 * no page here.
 *
 * The escrow is the authority for state, parties and delivery; the index
 * supplies what the chain does not hold (the agent's name, when Pokter saw
 * it funded, transactions Pokter sent). Where the chain could not be read,
 * the page says the values are Pokter's index and when it last read them,
 * rather than presenting them as fresh.
 */
export interface JobEvidence {
  chainId: 56 | 97;
  jobId: string;
  agent: { chainId: number; tokenId: string; name: string };
  escrow: string;
  /** From the escrow when it answered; otherwise null and `index` is what the page shows. */
  chain: { status: string; client: string; provider: string; expiredAt: number; submittedAt: number; deliverable: Hex } | null;
  status: string;
  statusSource: 'onchain' | 'index';
  statusReadAt: string;
  provider: string;
  amount: string;
  paymentToken: string | null;
  funder: JobFunder;
  /** True when a team wallet delivered it: Pokter's courier, not the agent's own wallet. */
  deliveredByPokter: boolean;
  hiredAt: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  review: { open: boolean; closes: string } | null;
  delivery:
    | { state: 'not-delivered' }
    | { state: 'chain-unread' }
    | { state: 'matches'; matchedBy: string; url: string | null }
    | { state: 'mismatch'; url: string | null }
    | { state: 'unread'; reason: string };
  /** Only for Pokter's own test jobs (`briefIsPublic`). */
  brief: string | null;
  /** For a delivered job whose record matches its hash, when its answer is public (`answerIsPublic`). */
  answer: DeliveredAnswer | null;
  /** Delivered and matching its hash, but the buyer has not chosen to publish the answer. */
  answerWithheld: boolean;
  receipt: { href: string; hash: string | null };
  fundingTx: string | null;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

export function indexedJob(chainId: 56 | 97, jobId: string): HiredJob | null {
  return getJobStore().all().find((job) => job.chainId === chainId && job.jobId === jobId) ?? null;
}

export async function loadJobEvidence(chainId: 56 | 97, jobId: string, now = Date.now()): Promise<JobEvidence | null> {
  const indexed = indexedJob(chainId, jobId);
  if (!indexed) return null;

  const onchain = await withTimeout(getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId)), 8_000);
  const chain = onchain && onchain.client && !/^0x0{40}$/i.test(onchain.client)
    ? { status: onchain.statusName, client: onchain.client, provider: onchain.provider, expiredAt: Number(onchain.expiredAt), submittedAt: Number(onchain.submittedAt), deliverable: onchain.deliverable as Hex }
    : null;
  const status = chain?.status ?? indexed.status;
  const provider = chain?.provider ?? indexed.provider;
  const paymentToken = indexed.paymentToken ?? (await withTimeout(jobPaymentTokenOnChain(chainId, jobId), 5_000));
  const team = teamWalletSet();
  const funder = jobFunder({ client: chain?.client ?? indexed.client, provider }, team);
  const expiredAt = chain?.expiredAt ?? Math.floor(Date.parse(indexed.expiredAt) / 1000);
  const submittedAt = chain?.submittedAt ?? 0;

  const window = submittedAt > 0 ? await withTimeout(disputeWindowSeconds(chainId), 5_000) : null;
  const review = window !== null && submittedAt > 0 ? reviewWindowSummary({ submittedAt, expiredAt, disputeWindowSeconds: window, now: Math.floor(now / 1000) }) : null;

  let delivery: JobEvidence['delivery'];
  let answer: DeliveredAnswer | null = null;
  let answerWithheld = false;
  if (!chain) delivery = { state: 'chain-unread' };
  else if (!wasDelivered(status)) delivery = { state: 'not-delivered' };
  else {
    const read = await readDeliveryText(chainId, jobId, { deliverable: chain.deliverable, submittedAt: BigInt(submittedAt) }, 8_000);
    if (!read.ok) delivery = { state: 'unread', reason: read.reason };
    else {
      const matchedBy = manifestMatch(read.text, chain.deliverable);
      delivery = matchedBy ? { state: 'matches', matchedBy, url: indexed.deliverableUrl } : { state: 'mismatch', url: indexed.deliverableUrl };
      /*
       * That the work was delivered, and matches its hash, is public on
       * every job. What it says is shown only when it is public
       * (`answerIsPublic`): Pokter's own tests, a self-hire, or a buyer
       * who chose to publish it. Never one that fails its own hash. The
       * brief stays the buyer's (`brief` below), and the page never
       * renders `answer.asked`.
       */
      if (matchedBy) {
        if (answerIsPublic(funder, getJobStore().answerPublication(chainId, jobId))) answer = readDeliveredAnswer(publishableAnswerText(read.text, funder, chain.client));
        else answerWithheld = true;
      }
    }
  }

  return {
    chainId,
    jobId,
    agent: { chainId: indexed.agentChainId ?? chainId, tokenId: indexed.agentTokenId, name: indexed.agentName },
    escrow: correctedErc8183Addresses(chainId).commerce,
    chain,
    status,
    statusSource: chain ? 'onchain' : 'index',
    statusReadAt: chain ? new Date(now).toISOString() : indexed.statusCheckedAt,
    provider,
    amount: jobAmountLabel({ chainId, paymentToken: paymentToken ?? null, budgetRaw: indexed.budgetRaw }),
    paymentToken: paymentToken ?? null,
    funder,
    deliveredByPokter: team.has(provider.toLowerCase()),
    hiredAt: indexed.hiredAt,
    deliveredAt: submittedAt > 0 ? new Date(submittedAt * 1000).toISOString() : null,
    expiresAt: Number.isFinite(expiredAt) && expiredAt > 0 ? new Date(expiredAt * 1000).toISOString() : null,
    review: review ? { open: review.open, closes: review.closes } : null,
    delivery,
    brief: briefIsPublic(funder) ? indexed.task : null,
    answer,
    answerWithheld,
    receipt: jobReceipt({ ...indexed, status: status as HiredJob['status'] }, escrowCommerceAddress),
    fundingTx: indexed.hireTxHash,
  };
}
