import { NextResponse } from 'next/server';
import { getAddress, type Address, type Hex } from 'viem';

import { historyClient } from '@/lib/erc8183/history-client';
import { getJobStore, type RemoteAttemptRow } from '@/lib/erc8183/store';
import { hasEvidence, publicIdFor, publicView, secretHash, settleRemote, type EvidenceReader } from '@/lib/hire/remote-attempts';
import type { AttemptChainReader } from '@/lib/hire/funding-journal';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { jobCreatedFromReceipt } from '@/lib/wallet/external-receipt';

export const dynamic = 'force-dynamic';

/*
 * A wallet's open funding attempt, shared across its devices. See
 * `hire/remote-attempts` for what this prevents and what it cannot.
 */

const GET_JOB_ABI = [{ name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }] }] }] as const;
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];

/* The address book is loaded only when the chain is read, so writes stay light. */
async function readers(chainId: 56 | 97, wallet: string, provider: string): Promise<AttemptChainReader & EvidenceReader & { commerce: Address; chainNow(): Promise<number>; onchain(jobId: bigint): Promise<{ client: string; provider: string; description: string; budget: bigint; expiredAt: bigint; statusName: string }> }> {
  const rpc = historyClient(chainId);
  const { correctedErc8183Addresses } = await import('@/lib/erc8183/addresses');
  const commerce = getAddress(correctedErc8183Addresses(chainId).commerce) as Address;
  const job = async (jobId: bigint) => {
    const j = await rpc.readContract({ address: commerce, abi: GET_JOB_ABI, functionName: 'getJob', args: [jobId] });
    return { client: j.client, provider: j.provider, budget: j.budget, description: j.description, expiredAt: j.expiredAt, statusName: STATUS[j.status] ?? 'UNKNOWN' };
  };
  const onchain = async (jobId: bigint) => {
    const j = await rpc.readContract({ address: commerce, abi: GET_JOB_ABI, functionName: 'getJob', args: [jobId] });
    return { client: j.client, provider: j.provider, budget: j.budget, description: j.description, expiredAt: j.expiredAt, statusName: STATUS[j.status] ?? 'UNKNOWN' };
  };
  return {
    commerce,
    onchain,
    async receipt(hash) {
      const r = await rpc.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
      return r ? { status: r.status === 'success' ? 'success' : 'reverted', logs: r.logs as unknown[] } : null;
    },
    async txState(hash) {
      const tx = await rpc.getTransaction({ hash: hash as Hex }).catch(() => null);
      if (!tx) return 'unknown';
      const mined = await rpc.getTransactionCount({ address: tx.from, blockTag: 'latest' }).catch(() => null);
      return mined !== null && mined > tx.nonce ? 'replaced' : 'pending';
    },
    job,
    jobIdFrom(logs) {
      try {
        return jobCreatedFromReceipt({ logs } as never, commerce, getAddress(wallet), getAddress(provider));
      } catch {
        return null;
      }
    },
    async tx(hash) {
      const tx = await rpc.getTransaction({ hash: hash as Hex }).catch(() => null);
      if (!tx) return null;
      const block = tx.blockNumber !== null ? await rpc.getBlock({ blockNumber: tx.blockNumber }).catch(() => null) : null;
      return { from: tx.from, to: tx.to ?? null, input: tx.input, timestamp: block ? Number(block.timestamp) : null };
    },
    async chainNow() {
      return Number((await rpc.getBlock({ blockTag: 'latest' })).timestamp);
    },
  };
}

const PROMPTS = new Set(['swapping', 'creating', 'registering', 'budgeting', 'approving', 'funding', 'batch']);
/*
 * A client's expiry, kept only as a hint while a record is unverified (and
 * unverified records never block). Verification replaces it with the one
 * decoded from the wallet's own create call.
 */
const fundableOf = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isInteger(raw) && raw > 0 && raw <= Math.floor(Date.now() / 1000) + 400 * 86_400 ? raw : null;
const chainOf = (raw: unknown): 56 | 97 | null => (Number(raw) === 56 ? 56 : Number(raw) === 97 ? 97 : null);
const walletOf = (raw: unknown): string | null => {
  try {
    return typeof raw === 'string' ? getAddress(raw).toLowerCase() : null;
  } catch {
    return null;
  }
};

/** The open record for a wallet, after the server has checked it against the chain itself. */
export async function GET(request: Request): Promise<NextResponse> {
  const limited = consumeRateLimit(`attempts-read:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const url = new URL(request.url);
  const wallet = walletOf(url.searchParams.get('wallet'));
  const chainId = chainOf(url.searchParams.get('chainId'));
  if (!wallet || !chainId) return NextResponse.json({ error: 'wallet and chainId (56 or 97) are required.' }, { status: 400 });
  const store = getJobStore();
  const open = store.openFundingAttempt(wallet, chainId);
  if (!open) return NextResponse.json({ open: null }, { headers: { 'cache-control': 'no-store' } });
  const read = await readers(chainId, wallet, open.provider);
  const at = new Date().toISOString();
  if (!open.verified) {
    const evidence = await hasEvidence(open, read, read.commerce);
    if (evidence.verified) store.updateFundingAttempt(open.publicId, { verified: true, fundableUntil: evidence.expiredAt }, at);
  }
  try {
    const settled = await settleRemote(store.openFundingAttempt(wallet, chainId) ?? open, read, await read.chainNow());
    if (settled.outcome === 'funded' || settled.outcome === 'mismatch') {
      store.closeFundingAttempt(open.publicId, `${settled.outcome}:${settled.jobId}`, at);
      /* Adopted for every device: indexed with its token, as the funding device would have. */
      const { indexIfMissing } = await import('@/lib/erc8183/job-identity');
      await indexIfMissing({ chainId, jobId: settled.jobId, onchain: await read.onchain(BigInt(settled.jobId)) }).catch(() => false);
      return NextResponse.json({ open: null, closed: { reason: settled.outcome, jobId: settled.jobId } }, { headers: { 'cache-control': 'no-store' } });
    }
    if (settled.outcome === 'impossible') {
      store.closeFundingAttempt(open.publicId, 'no-payment-can-follow', at);
      return NextResponse.json({ open: null, closed: { reason: 'no-payment-can-follow' } }, { headers: { 'cache-control': 'no-store' } });
    }
  } catch {
    /* Unreadable: kept open, as it was. */
  }
  return NextResponse.json({ open: publicView(store.openFundingAttempt(wallet, chainId) ?? open) }, { headers: { 'cache-control': 'no-store' } });
}

/**
 * `begin` records an attempt (refused while another is open for the wallet
 * and chain); `update` adds identifiers and, once the chain shows the wallet
 * acted, marks it verified; `close` ends it — only with the attempt's secret.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limited = consumeRateLimit(`attempts-write:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const wallet = walletOf(body?.wallet);
  const chainId = chainOf(body?.chainId);
  const secret = typeof body?.secret === 'string' && body.secret.length >= 16 && body.secret.length <= 200 ? body.secret : null;
  if (!body || !wallet || !chainId || !secret) return NextResponse.json({ error: 'wallet, chainId and secret are required.' }, { status: 400 });
  const store = getJobStore();
  const at = new Date().toISOString();
  const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v : null);
  const hashes = Array.isArray(body.txHashes) ? body.txHashes.filter((h): h is string => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h)).slice(0, 12) : undefined;

  if (body.action === 'begin') {
    const provider = walletOf(body.provider);
    const description = str(body.description, 8_192);
    const token = walletOf(body.token);
    const amountRaw = typeof body.amountRaw === 'string' && /^\d{1,78}$/.test(body.amountRaw) ? body.amountRaw : null;
    if (!provider || description === null || !token || !amountRaw) return NextResponse.json({ error: 'provider, description, token and amountRaw are required to begin.' }, { status: 400 });
    const record: RemoteAttemptRow = {
      publicId: publicIdFor(secret), secretHash: secretHash(secret), wallet, chainId, provider, description, token, amountRaw,
      predictedJobId: str(body.predictedJobId, 20), jobId: null, callsId: null, txHashes: [], prompt: null,
      fundableUntil: fundableOf(body.fundableUntil), verified: false, state: 'open', closeReason: null, createdAt: at, updatedAt: at,
    };
    /*
     * Only a verified record holds the wallet. One without chain evidence —
     * which anyone could have posted — is replaced by the next device to
     * begin, so it can never lock a wallet out of hiring.
     */
    const existing = store.openFundingAttempt(wallet, chainId);
    if (existing && !existing.verified) store.closeFundingAttempt(existing.publicId, 'superseded', at);
    const inserted = store.insertFundingAttempt(record);
    if (!inserted) {
      const open = store.openFundingAttempt(wallet, chainId);
      return NextResponse.json({ error: 'Another funding attempt from this wallet is open.', open: open ? publicView(open) : null }, { status: 409 });
    }
    return NextResponse.json({ publicId: publicIdFor(secret) });
  }

  const open = store.openFundingAttempt(wallet, chainId);
  if (!open || open.secretHash !== secretHash(secret)) return NextResponse.json({ error: 'No open attempt with that secret.' }, { status: 404 });

  if (body.action === 'update') {
    const merged = hashes ? [...new Set([...open.txHashes, ...hashes])].slice(0, 24) : undefined;
    store.updateFundingAttempt(open.publicId, {
      ...(merged ? { txHashes: merged } : {}),
      ...(str(body.jobId, 20) ? { jobId: str(body.jobId, 20) } : {}),
      ...(str(body.predictedJobId, 20) ? { predictedJobId: str(body.predictedJobId, 20) } : {}),
      ...(str(body.callsId) ? { callsId: str(body.callsId) } : {}),
      ...(typeof body.prompt === 'string' && PROMPTS.has(body.prompt) ? { prompt: body.prompt } : {}),
      ...(fundableOf(body.fundableUntil) !== null ? { fundableUntil: fundableOf(body.fundableUntil) } : {}),
    }, at);
    const updated = store.openFundingAttempt(wallet, chainId)!;
    if (!updated.verified && hashes?.length) {
      const read = await readers(chainId, wallet, updated.provider);
      const evidence = await hasEvidence(updated, read, read.commerce);
      if (evidence.verified) store.updateFundingAttempt(updated.publicId, { verified: true, fundableUntil: evidence.expiredAt }, at);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'close') {
    const reason = body.reason === 'funded' || body.reason === 'nothing-sent' ? body.reason : null;
    if (!reason) return NextResponse.json({ error: 'reason must be funded or nothing-sent.' }, { status: 400 });
    store.closeFundingAttempt(open.publicId, reason, at);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'action must be begin, update or close.' }, { status: 400 });
}
