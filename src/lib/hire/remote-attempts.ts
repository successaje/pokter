import { createHash } from 'node:crypto';

import { decodeFunctionData } from 'viem';

import { paymentImpossible, pastFundable, reconcileAttempt, type AttemptChainReader, type FundingAttempt } from './funding-journal';
import type { RemoteAttemptRow } from '@/lib/erc8183/store';
import type { PublicAttempt } from './remote-attempt-client';

export type { PublicAttempt } from './remote-attempt-client';
export { remoteDecision } from './remote-attempt-client';

/**
 * Funding attempts shared across a wallet's devices.
 *
 * The browser lock (`funding-journal`) stops a second tab of the same browser
 * from starting a hire while one is being funded. It cannot see another
 * browser or another device. This is the part that can: each attempt is also
 * recorded here, by wallet and chain, and every device asks before funding.
 *
 * What it prevents: a second device starting a new hire while an attempt
 * from the same wallet may still pay — a created job not yet funded, a fund
 * or batch prompt possibly still open in a wallet — and a funded job being
 * missed because the device that funded it went away (the server reconciles
 * and the job is adopted into the index for every device).
 *
 * What it cannot prevent, and does not claim to:
 * - payments made outside Pokter, or from a device that never reached the
 *   server (offline, blocked, or an older build);
 * - two devices that start within the same instant: the server refuses the
 *   second record, but a wallet that already signed on both is not undone;
 * - a buyer who confirms past the warning for an attempt with no evidence yet.
 *
 * Abuse resistance. Writes are unauthenticated, so a record only *blocks*
 * once the chain shows that this wallet created *this attempt's* job
 * (`verified`): a create transaction from the wallet, to the escrow, sent
 * after the record began, whose description is the attempt's own — the
 * description carries the brief and the agent's signed quote, which nobody
 * else can know in advance. An old transaction or someone else's job proves
 * nothing. A record without that evidence never blocks: it is a warning, and
 * the next device to begin replaces it. Closing needs the attempt's secret
 * (held only by the device that made it) or chain proof the server finds
 * itself. A verified record's deadline is the `expiredAt` decoded from that
 * same create call, never a value a client sent, so the server closes it
 * exactly when the escrow would refuse to fund it: by proof, never because
 * time passed. A record funded in another amount is kept as a job (indexed,
 * shown) and stops blocking.
 *
 * A batch (`wallet_sendCalls`) is sent to the wallet's own account, not the
 * escrow, so a batched $U hire is never verified here: it warns, it does not
 * block. The browser's own journal still protects that browser.
 */

export const secretHash = (secret: string) => createHash('sha256').update(`pokter-attempt:${secret}`).digest('hex');
export const publicIdFor = (secret: string) => createHash('sha256').update(`pokter-attempt-public:${secret}`).digest('hex').slice(0, 24);

export function publicView(row: RemoteAttemptRow): PublicAttempt {
  return {
    publicId: row.publicId,
    chainId: row.chainId,
    verified: row.verified,
    startedAt: row.createdAt,
    updatedAt: row.updatedAt,
    jobId: row.jobId,
    predictedJobId: row.predictedJobId,
    txHashes: row.txHashes,
    prompt: row.prompt,
    fundableUntil: row.fundableUntil,
    token: row.token,
    amountRaw: row.amountRaw,
  };
}

export interface EvidenceReader {
  /** A transaction as the node knows it, with its block time (null while pending), or null when unknown. */
  tx(hash: string): Promise<{ from: string; to: string | null; input: string; timestamp: number | null } | null>;
}

const CREATE_ABI = [
  { type: 'function', name: 'createJob', stateMutability: 'nonpayable', inputs: [{ name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'expiredAt', type: 'uint256' }, { name: 'description', type: 'string' }, { name: 'hook', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'createJobWithToken', stateMutability: 'nonpayable', inputs: [{ name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'expiredAt', type: 'uint256' }, { name: 'description', type: 'string' }, { name: 'hook', type: 'address' }, { name: 'paymentToken', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

/** Clock skew allowed between the record's start and the create transaction's block. */
const EVIDENCE_SKEW_SECONDS = 120;

/**
 * Whether the chain shows this wallet created this attempt's job: a create
 * transaction from the wallet, to the escrow, at or after the record began,
 * whose description is exactly the attempt's.
 */
export async function hasEvidence(
  row: Pick<RemoteAttemptRow, 'wallet' | 'txHashes' | 'description' | 'createdAt' | 'provider'>,
  read: EvidenceReader,
  commerce: string,
): Promise<{ verified: true; expiredAt: number } | { verified: false }> {
  const wallet = row.wallet.toLowerCase();
  const began = Math.floor(Date.parse(row.createdAt) / 1000) - EVIDENCE_SKEW_SECONDS;
  for (const hash of row.txHashes.slice(0, 12)) {
    const tx = await read.tx(hash).catch(() => null);
    if (!tx || tx.from.toLowerCase() !== wallet || tx.to?.toLowerCase() !== commerce.toLowerCase()) continue;
    if (tx.timestamp !== null && tx.timestamp < began) continue;
    try {
      const call = decodeFunctionData({ abi: CREATE_ABI, data: tx.input as `0x${string}` });
      if (call.args[3] === row.description && String(call.args[0]).toLowerCase() === row.provider.toLowerCase()) return { verified: true, expiredAt: Number(call.args[2]) };
    } catch {
      /* Not a create call: proves nothing. */
    }
  }
  return { verified: false };
}

function asAttempt(row: RemoteAttemptRow): FundingAttempt {
  return {
    attemptId: row.publicId,
    ownerTab: 'remote',
    wallet: row.wallet,
    chainId: row.chainId,
    provider: row.provider,
    agent: { chainId: row.chainId, tokenId: '', name: '' },
    task: '',
    description: row.description,
    token: row.token,
    amountRaw: row.amountRaw,
    fundableUntil: row.fundableUntil,
    startedAt: row.createdAt,
    updatedAt: row.updatedAt,
    predictedJobId: row.predictedJobId,
    jobId: row.jobId,
    callsId: row.callsId,
    txHashes: row.txHashes,
    prompt: row.prompt as FundingAttempt['prompt'],
    state: 'pending',
  };
}

/**
 * The server's own reading of an open record. `funded` and `impossible`
 * close it; `open` keeps it. A chain that cannot be read keeps it open.
 */
export async function settleRemote(row: RemoteAttemptRow, read: AttemptChainReader, chainNowSeconds: number): Promise<{ outcome: 'funded'; jobId: string } | { outcome: 'mismatch'; jobId: string } | { outcome: 'impossible' } | { outcome: 'open'; detail: string }> {
  const verdict = await reconcileAttempt(asAttempt(row), read);
  if (verdict.outcome === 'funded') return { outcome: 'funded', jobId: verdict.jobId };
  /* Funded in another amount: kept as a job by the caller (indexed, shown), and nothing more can be paid into it. */
  if (verdict.outcome === 'mismatch') return { outcome: 'mismatch', jobId: verdict.jobId };
  const proven = verdict.outcome === 'not-funded' && row.fundableUntil === null && verdict.expiredAt != null ? { ...asAttempt(row), fundableUntil: verdict.expiredAt } : asAttempt(row);
  if (verdict.outcome === 'not-funded' && paymentImpossible(proven, chainNowSeconds)) return { outcome: 'impossible' };
  /* Past the deadline proven for this attempt nothing in flight can create or fund its job. */
  if (pastFundable(proven, chainNowSeconds)) return { outcome: 'impossible' };
  return { outcome: 'open', detail: 'detail' in verdict ? verdict.detail : 'Not resolved yet.' };
}
